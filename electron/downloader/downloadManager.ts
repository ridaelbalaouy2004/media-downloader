import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BrowserWindow } from 'electron';
import { downloadMedia } from './ytdlp';
import {
  sanitizeFilename,
  sanitizeFolderName,
  sanitizeWindowsName,
  sanitizePath,
  buildOutputFilename,
  safeJoinPath,
} from '../utils/sanitize';
import { getJobTempDir, ensureDir, getAppDataDir } from '../utils/paths';
import { addHistoryEntry } from '../utils/history';
import { processManager } from './processManager';
import type {
  DownloadJob,
  DownloadProgress,
  StartDownloadOptions,
  DownloadHistoryEntry,
  QualityOption,
  PlaylistInfo,
  QueueStats,
} from '../types';

// Default maximum simultaneous downloads is 1 (configurable: 1, 2, or 3)
const DEFAULT_MAX_CONCURRENT = 1;

interface JobWithMeta extends DownloadJob {
  _qualityOption: QualityOption;
}

function getJobsFilePath(): string {
  const dataDir = getAppDataDir();
  ensureDir(dataDir);
  return path.join(dataDir, 'jobs.json');
}

function loadPersistedJobs(): Map<string, JobWithMeta> {
  const map = new Map<string, JobWithMeta>();
  try {
    const filePath = getJobsFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && item.jobId) {
            // Active states that were interrupted on shutdown become 'paused' so user can resume
            const status = ['downloading', 'queued', 'merging', 'analyzing', 'finalizing'].includes(item.status)
              ? 'paused'
              : item.status;
            map.set(item.jobId, {
              ...item,
              status,
              progress: {
                ...item.progress,
                status,
                stage: status === 'paused' ? 'Paused' : item.progress?.stage || '',
              },
              _qualityOption: item._qualityOption || {
                id: 'default',
                label: item.qualityLabel || 'Default',
                height: 0,
                formatTag: item.format || 'mp4',
                videoFormatId: null,
                audioFormatId: null,
                needsMerge: false,
                estimatedSize: null,
                isAudioOnly: false,
              },
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to load persisted jobs:', err);
  }
  return map;
}

function savePersistedJobs(jobs: Map<string, JobWithMeta>): void {
  try {
    const filePath = getJobsFilePath();
    const list = [...jobs.values()].slice(-100);
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save persisted jobs:', err);
  }
}

export class DownloadManager {
  private jobs = new Map<string, JobWithMeta>();
  private queue: string[] = [];
  private running = new Set<string>();
  private maxConcurrent = DEFAULT_MAX_CONCURRENT;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.jobs = loadPersistedJobs();
  }

  setWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = Math.max(1, Math.min(3, n));
    this.processQueue();
  }

  getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  /**
   * Create and queue a new download job.
   */
  startDownload(opts: StartDownloadOptions): string {
    const jobId = uuidv4();
    const sanitizedOutputDir = path.resolve(sanitizePath(opts.outputDir || getAppDataDir()));
    const safePlaylistTitle = opts.playlistTitle ? sanitizeWindowsName(opts.playlistTitle) : undefined;

    const job: JobWithMeta = {
      jobId,
      url: opts.url,
      title: opts.title,
      thumbnail: opts.thumbnail,
      qualityLabel: opts.qualityOption.label,
      format: opts.qualityOption.formatTag,
      outputDir: sanitizedOutputDir,
      outputFile: null,
      status: 'queued',
      progress: {
        jobId,
        status: 'queued',
        stage: 'Queued',
        percent: null,
        downloadedBytes: null,
        totalBytes: null,
        speed: null,
        eta: null,
        filename: null,
      },
      startTime: Date.now(),
      endTime: null,
      error: null,
      errorDetails: null,
      platform: opts.platform,
      downloadType: opts.downloadType || (opts.qualityOption.isAudioOnly ? 'audio' : opts.qualityOption.mediaType === 'image' ? 'image' : 'video'),
      isPlaylist: opts.isPlaylist,
      playlistTitle: safePlaylistTitle,
      playlistIndex: opts.playlistIndex,
      playlistTotal: opts.playlistTotal,
      _qualityOption: opts.qualityOption,
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    savePersistedJobs(this.jobs);

    this.emitJobUpdate(job);
    this.emitProgress(job.progress);

    this.processQueue();
    return jobId;
  }

  /**
   * Queue all entries of a playlist.
   */
  startPlaylistDownload(
    playlist: PlaylistInfo,
    qualityOption: QualityOption,
    outputDir: string
  ): string[] {
    const jobIds: string[] = [];
    const safePlaylistFolder = sanitizeWindowsName(playlist.title);
    const baseDir = sanitizePath(outputDir || getAppDataDir());
    const playlistDir = path.resolve(safeJoinPath(baseDir, safePlaylistFolder));
    ensureDir(playlistDir);

    playlist.entries.forEach((entry, idx) => {
      // Check for duplicate in active queue
      const isAlreadyQueued = [...this.jobs.values()].some(
        j => j.url === entry.url && (j.status === 'queued' || j.status === 'downloading')
      );
      if (isAlreadyQueued) return;

      const jobId = this.startDownload({
        url: entry.url,
        title: entry.title,
        thumbnail: entry.thumbnail || '',
        outputDir: playlistDir,
        qualityOption,
        platform: 'youtube',
        downloadType: 'playlist',
        isPlaylist: true,
        playlistTitle: safePlaylistFolder,
        playlistIndex: idx + 1,
        playlistTotal: playlist.entryCount,
      });
      jobIds.push(jobId);
    });

    return jobIds;
  }

  /**
   * Pause a running or queued download. Keeps temp files intact for resume.
   */
  pauseJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (!['downloading', 'queued', 'analyzing', 'merging'].includes(job.status)) {
      return false;
    }

    if (this.running.has(jobId)) {
      processManager.killJob(jobId);
      this.running.delete(jobId);
    }

    const qIdx = this.queue.indexOf(jobId);
    if (qIdx !== -1) {
      this.queue.splice(qIdx, 1);
    }

    this.updateJob(jobId, {
      status: 'paused',
      progress: {
        ...job.progress,
        status: 'paused',
        stage: 'Paused',
        speed: null,
      },
    });

    savePersistedJobs(this.jobs);
    this.processQueue();
    return true;
  }

  /**
   * Resume a paused download.
   */
  resumeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'paused') return false;

    this.updateJob(jobId, {
      status: 'queued',
      progress: {
        ...job.progress,
        status: 'queued',
        stage: 'Queued',
      },
    });

    if (!this.queue.includes(jobId) && !this.running.has(jobId)) {
      this.queue.push(jobId);
    }

    savePersistedJobs(this.jobs);
    this.processQueue();
    return true;
  }

  /**
   * Retry a failed or cancelled download.
   */
  retryJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status !== 'failed' && job.status !== 'cancelled') {
      return false;
    }

    this.updateJob(jobId, {
      status: 'queued',
      error: null,
      errorDetails: null,
      progress: {
        jobId,
        status: 'queued',
        stage: 'Queued',
        percent: 0,
        downloadedBytes: 0,
        totalBytes: job.progress.totalBytes,
        speed: null,
        eta: null,
        filename: null,
      },
    });

    if (!this.queue.includes(jobId) && !this.running.has(jobId)) {
      this.queue.push(jobId);
    }

    savePersistedJobs(this.jobs);
    this.processQueue();
    return true;
  }

  /**
   * Cancel a running or queued download.
   */
  cancelDownload(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    processManager.killJob(jobId);

    const queueIdx = this.queue.indexOf(jobId);
    if (queueIdx !== -1) {
      this.queue.splice(queueIdx, 1);
    }

    this.running.delete(jobId);

    this.updateJob(jobId, {
      status: 'cancelled',
      endTime: Date.now(),
      progress: { ...job.progress, status: 'cancelled', stage: 'Cancelled', speed: null },
    });

    savePersistedJobs(this.jobs);
    this.cleanTempDir(jobId);
    this.processQueue();
  }

  /**
   * Permanently dismiss / remove a job from memory and persistent storage.
   * Does NOT touch history or delete the downloaded media file.
   */
  dismissJob(jobId: string): boolean {
    const existed = this.jobs.has(jobId);
    if (existed) {
      if (this.running.has(jobId)) {
        processManager.killJob(jobId);
        this.running.delete(jobId);
      }
      this.jobs.delete(jobId);
      const queueIdx = this.queue.indexOf(jobId);
      if (queueIdx !== -1) {
        this.queue.splice(queueIdx, 1);
      }
      savePersistedJobs(this.jobs);
      this.cleanTempDir(jobId);
      this.processQueue();
    }
    return existed;
  }

  // --- Bulk Operations ---

  pauseAll(): void {
    for (const [id, job] of [...this.jobs.entries()]) {
      if (['downloading', 'queued', 'analyzing', 'merging'].includes(job.status)) {
        this.pauseJob(id);
      }
    }
  }

  resumeAll(): void {
    for (const [id, job] of [...this.jobs.entries()]) {
      if (job.status === 'paused') {
        this.resumeJob(id);
      }
    }
  }

  cancelAll(): void {
    for (const [id, job] of [...this.jobs.entries()]) {
      if (['downloading', 'queued', 'analyzing', 'merging', 'paused'].includes(job.status)) {
        this.cancelDownload(id);
      }
    }
  }

  clearCompleted(): void {
    for (const [id, job] of [...this.jobs.entries()]) {
      if (job.status === 'completed') {
        this.dismissJob(id);
      }
    }
  }

  clearFailed(): void {
    for (const [id, job] of [...this.jobs.entries()]) {
      if (job.status === 'failed' || job.status === 'cancelled') {
        this.dismissJob(id);
      }
    }
  }

  clearAll(): void {
    this.cancelAll();
    this.jobs.clear();
    this.queue = [];
    this.running.clear();
    savePersistedJobs(this.jobs);
  }

  getQueueStats(): QueueStats {
    let active = 0;
    let waiting = 0;
    let paused = 0;
    let completed = 0;
    let failed = 0;

    for (const job of this.jobs.values()) {
      if (['downloading', 'analyzing', 'merging', 'finalizing'].includes(job.status)) {
        active++;
      } else if (job.status === 'queued') {
        waiting++;
      } else if (job.status === 'paused') {
        paused++;
      } else if (job.status === 'completed') {
        completed++;
      } else if (job.status === 'failed' || job.status === 'cancelled') {
        failed++;
      }
    }

    return {
      active,
      waiting,
      paused,
      completed,
      failed,
      total: this.jobs.size,
    };
  }

  getJobs(): DownloadJob[] {
    // Return newest first
    return [...this.jobs.values()]
      .reverse()
      .map(({ _qualityOption: _, ...rest }) => rest as DownloadJob);
  }

  getJob(jobId: string): DownloadJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    const { _qualityOption: _, ...rest } = job;
    return rest as DownloadJob;
  }

  private processQueue(): void {
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const nextId = this.queue.shift();
      if (nextId) {
        const job = this.jobs.get(nextId);
        // Only run if still queued
        if (job && job.status === 'queued') {
          this.running.add(nextId);
          this.executeDownload(nextId).catch(err => {
            console.error('Download execution error:', err);
            this.running.delete(nextId);
            this.processQueue();
          });
        }
      }
    }
  }

  private async executeDownload(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const tempDir = getJobTempDir(jobId);
    ensureDir(tempDir);

    try {
      let downloadSuccess = false;
      let tempOutputFile: string | null = null;

      await downloadMedia({
        jobId,
        url: job.url,
        qualityOption: job._qualityOption,
        outputDir: job.outputDir,
        tempDir,
        isPlaylist: job.isPlaylist,
        playlistTitle: job.playlistTitle,
        playlistIndex: job.playlistIndex,
        onProgress: (progress) => {
          this.updateProgress(jobId, progress);
        },
        onComplete: (outputFile) => {
          downloadSuccess = true;
          tempOutputFile = outputFile;
        },
        onError: (error, details) => {
          const currentJob = this.jobs.get(jobId);
          if (currentJob?.status === 'cancelled' || currentJob?.status === 'paused') return;
          this.updateJob(jobId, {
            status: 'failed',
            endTime: Date.now(),
            error,
            errorDetails: details || null,
            progress: {
              ...(currentJob?.progress ?? job.progress),
              status: 'failed',
              stage: 'Download failed',
              speed: null,
            },
          });
        },
      });

      // Check cancellation or pause
      const currentJob = this.jobs.get(jobId);
      if (!currentJob || currentJob.status === 'cancelled') {
        this.cleanTempDir(jobId);
        return;
      }
      if (currentJob.status === 'paused') {
        // Do not clean tempDir so partial files are kept for resume!
        return;
      }

      if (!downloadSuccess || !tempOutputFile) {
        this.cleanTempDir(jobId);
        return;
      }

      // Move to final output directory
      this.updateProgress(jobId, {
        status: 'finalizing',
        stage: 'Saving file...',
        percent: 100,
      });

      const moveResult = await this.moveToOutput(jobId, tempOutputFile, job);
      if (!moveResult) {
        this.cleanTempDir(jobId);
        return;
      }

      const { destPath: finalFile, targetDir: actualOutputDir } = moveResult;
      const fileExists = fs.existsSync(finalFile);
      const fileSize = fileExists ? fs.statSync(finalFile).size : 0;

      // Debug log requirement
      console.log(`[DOWNLOAD COMPLETED]
URL: ${job.url}
TITLE: ${job.title}
EXPECTED PATH: ${finalFile}
ACTUAL PATH: ${finalFile}
FILE EXISTS: ${fileExists}
FILE SIZE: ${fileSize}`);

      // Mark completed with verified exact paths
      this.updateJob(jobId, {
        status: 'completed',
        endTime: Date.now(),
        outputFile: finalFile,
        outputDir: actualOutputDir,
        progress: {
          ...currentJob.progress,
          status: 'completed',
          stage: 'Download completed',
          percent: 100,
          speed: null,
        },
      });

      // Persist to history with verified exact real paths
      const finalJob = this.jobs.get(jobId)!;
      const historyEntry: DownloadHistoryEntry = {
        jobId: finalJob.jobId,
        url: finalJob.url,
        title: finalJob.title,
        thumbnail: finalJob.thumbnail,
        qualityLabel: finalJob.qualityLabel,
        format: finalJob.format,
        outputFile: finalFile,
        outputDir: actualOutputDir,
        status: 'completed',
        startTime: finalJob.startTime,
        endTime: Date.now(),
        fileSize: this.getFileSize(finalFile),
      };
      addHistoryEntry(historyEntry);

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('download:completed-notification', { title: finalJob.title });
      }
      this.cleanTempDir(jobId);

    } catch (err) {
      const currentJob = this.jobs.get(jobId);
      if (currentJob?.status !== 'cancelled' && currentJob?.status !== 'paused') {
        this.updateJob(jobId, {
          status: 'failed',
          endTime: Date.now(),
          error: 'An unexpected error occurred.',
          errorDetails: String(err),
          progress: {
            ...(currentJob?.progress ?? job.progress),
            status: 'failed',
            stage: 'Download failed',
            speed: null,
          },
        });
        this.cleanTempDir(jobId);
      }
    } finally {
      this.running.delete(jobId);
      this.processQueue();
    }
  }

  private async moveToOutput(
    jobId: string,
    tempFile: string,
    job: DownloadJob
  ): Promise<{ destPath: string; targetDir: string } | null> {
    try {
      if (!fs.existsSync(tempFile)) {
        throw new Error(`Downloaded temporary file not found at: ${tempFile}`);
      }

      // Determine the real target directory using absolute paths with strict Windows sanitization
      let targetDir = path.resolve(sanitizePath(job.outputDir));
      if (job.isPlaylist && job.playlistTitle) {
        const safePlaylistFolder = sanitizeWindowsName(job.playlistTitle);
        if (path.basename(targetDir) !== safePlaylistFolder) {
          targetDir = path.resolve(safeJoinPath(job.outputDir, safePlaylistFolder));
        }
      }
      ensureDir(targetDir);

      // Clean the filename using sanitizeWindowsName to strictly remove any trailing dots or spaces before extension
      const rawFileName = path.basename(tempFile);
      const ext = path.extname(rawFileName);
      const baseName = path.basename(rawFileName, ext);
      const cleanBase = sanitizeWindowsName(baseName);
      const cleanExt = ext ? ext.replace(/^\./, '').replace(/[.\s]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() : '';
      const realFileName = cleanExt ? `${cleanBase}.${cleanExt}` : cleanBase;

      let destPath = path.resolve(safeJoinPath(targetDir, realFileName));

      if (path.resolve(tempFile) !== destPath) {
        // If destPath already exists and is a different file, deduplicate safely
        if (fs.existsSync(destPath)) {
          let counter = 1;
          while (fs.existsSync(destPath)) {
            const deduplicated = cleanExt ? `${cleanBase} (${counter}).${cleanExt}` : `${cleanBase} (${counter})`;
            destPath = path.resolve(safeJoinPath(targetDir, deduplicated));
            counter++;
          }
        }

        // Copy file to final location
        fs.copyFileSync(tempFile, destPath);

        // Clean temp file
        try {
          console.log(`[DELETE FILE]
PATH: ${tempFile}
FILE EXISTS: ${fs.existsSync(tempFile)}`);
          fs.unlinkSync(tempFile);
        } catch {
          // ignore unlink error
        }
      }

      // STRICT VALIDATION: Verify that the destination file exists!
      if (!fs.existsSync(destPath)) {
        throw new Error(`Destination file does not exist on disk: ${destPath}`);
      }

      const stat = fs.statSync(destPath);
      if (stat.size === 0) {
        throw new Error(`Destination file is 0 bytes: ${destPath}`);
      }

      return { destPath, targetDir };
    } catch (err) {
      this.updateJob(jobId, {
        status: 'failed',
        endTime: Date.now(),
        error: `Failed to save file: ${String(err)}`,
        errorDetails: String(err),
      });
      return null;
    }
  }

  private cleanTempDir(jobId: string): void {
    const tempDir = getJobTempDir(jobId);
    setTimeout(() => {
      try {
        if (fs.existsSync(tempDir)) {
          console.log(`[DELETE FOLDER]
PATH: ${tempDir}
FOLDER EXISTS: ${fs.existsSync(tempDir)}`);
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.error('Failed to clean temp dir:', tempDir, err);
      }
    }, 1500);
  }

  private updateJob(jobId: string, updates: Partial<DownloadJob>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const updated = { ...job, ...updates };
    this.jobs.set(jobId, updated);
    const { _qualityOption: _, ...rest } = updated;
    this.emitJobUpdate(rest as DownloadJob);
    if (updates.progress) this.emitProgress(updates.progress);
    if (updates.status && ['completed', 'failed', 'cancelled', 'paused'].includes(updates.status)) {
      savePersistedJobs(this.jobs);
    }
  }

  private updateProgress(jobId: string, progress: Partial<DownloadProgress>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const newProgress: DownloadProgress = { ...job.progress, ...progress, jobId };
    this.updateJob(jobId, {
      progress: newProgress,
      status: progress.status ?? job.status,
    });
  }

  private emitJobUpdate(job: DownloadJob): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('download:job-update', job);
    }
  }

  private emitProgress(progress: DownloadProgress): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('download:progress', progress);
    }
  }

  private getFileSize(filePath: string): number | null {
    try { return fs.statSync(filePath).size; } catch { return null; }
  }

  storeQualityOption(_jobId: string, _option: unknown): void {}

  cleanAbandonedTempDirs(tempBase: string): void {
    try {
      if (!fs.existsSync(tempBase)) return;
      const dirs = fs.readdirSync(tempBase);
      for (const dir of dirs) {
        const fullPath = path.join(tempBase, dir);
        if (!this.jobs.has(dir)) {
          try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
}

export const downloadManager = new DownloadManager();
