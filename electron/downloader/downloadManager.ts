import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BrowserWindow } from 'electron';
import { downloadMedia } from './ytdlp';
import { buildOutputFilename } from '../utils/sanitize';
import { getJobTempDir, ensureDir } from '../utils/paths';
import { addHistoryEntry } from '../utils/history';
import { processManager } from './processManager';
import type {
  DownloadJob,
  DownloadProgress,
  StartDownloadOptions,
  DownloadHistoryEntry,
  QualityOption,
} from '../types';

const MAX_CONCURRENT = 2;

interface JobWithMeta extends DownloadJob {
  _qualityOption: QualityOption;
}

class DownloadManager {
  private jobs = new Map<string, JobWithMeta>();
  private queue: string[] = [];
  private running = new Set<string>();
  private maxConcurrent = MAX_CONCURRENT;
  private mainWindow: BrowserWindow | null = null;

  setWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = Math.max(1, Math.min(10, n));
    this.processQueue();
  }

  /**
   * Create and queue a new download job.
   * The qualityOption is carried internally so the renderer never re-sends it.
   */
  startDownload(opts: StartDownloadOptions): string {
    const jobId = uuidv4();

    const job: JobWithMeta = {
      jobId,
      url: opts.url,
      title: opts.title,
      thumbnail: opts.thumbnail,
      qualityLabel: opts.qualityOption.label,
      format: opts.qualityOption.formatTag,
      outputDir: opts.outputDir,
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
      _qualityOption: opts.qualityOption,
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);

    this.emitJobUpdate(job);
    this.emitProgress(job.progress);

    this.processQueue();
    return jobId;
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
      progress: { ...job.progress, status: 'cancelled', stage: 'Cancelled' },
    });

    this.cleanTempDir(jobId);
    this.processQueue();
  }

  getJobs(): DownloadJob[] {
    // Strip internal _qualityOption before sending to renderer
    return [...this.jobs.values()].map(({ _qualityOption: _, ...rest }) => rest as DownloadJob);
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
        this.running.add(nextId);
        this.executeDownload(nextId).catch(err => {
          console.error('Download execution error:', err);
          this.running.delete(nextId);
          this.processQueue();
        });
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
        onProgress: (progress) => {
          this.updateProgress(jobId, progress);
        },
        onComplete: (outputFile) => {
          downloadSuccess = true;
          tempOutputFile = outputFile;
        },
        onError: (error, details) => {
          const currentJob = this.jobs.get(jobId);
          if (currentJob?.status === 'cancelled') return;
          this.updateJob(jobId, {
            status: 'failed',
            endTime: Date.now(),
            error,
            errorDetails: details || null,
            progress: {
              ...(currentJob?.progress ?? job.progress),
              status: 'failed',
              stage: 'Download failed',
            },
          });
        },
      });

      // Check cancellation
      const currentJob = this.jobs.get(jobId);
      if (!currentJob || currentJob.status === 'cancelled') {
        this.cleanTempDir(jobId);
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

      const finalFile = await this.moveToOutput(jobId, tempOutputFile, job);
      if (!finalFile) {
        this.cleanTempDir(jobId);
        return;
      }

      // Mark completed (Requirement 12: Download completed)
      this.updateJob(jobId, {
        status: 'completed',
        endTime: Date.now(),
        outputFile: finalFile,
        progress: {
          ...currentJob.progress,
          status: 'completed',
          stage: 'Download completed',
          percent: 100,
        },
      });

      // Persist to history
      const finalJob = this.jobs.get(jobId)!;
      const historyEntry: DownloadHistoryEntry = {
        jobId: finalJob.jobId,
        url: finalJob.url,
        title: finalJob.title,
        thumbnail: finalJob.thumbnail,
        qualityLabel: finalJob.qualityLabel,
        format: finalJob.format,
        outputFile: finalFile,
        outputDir: finalJob.outputDir,
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
      if (currentJob?.status !== 'cancelled') {
        this.updateJob(jobId, {
          status: 'failed',
          endTime: Date.now(),
          error: 'An unexpected error occurred.',
          errorDetails: String(err),
          progress: {
            ...(currentJob?.progress ?? job.progress),
            status: 'failed',
            stage: 'Download failed',
          },
        });
      }
      this.cleanTempDir(jobId);
    } finally {
      this.running.delete(jobId);
      this.processQueue();
    }
  }

  private async moveToOutput(
    jobId: string,
    tempFile: string,
    job: DownloadJob
  ): Promise<string | null> {
    try {
      const ext = path.extname(tempFile);
      const safeName = buildOutputFilename(job.title, ext.replace('.', ''));
      let destPath = path.join(job.outputDir, safeName);

      let counter = 1;
      while (fs.existsSync(destPath)) {
        const baseName = path.basename(safeName, ext);
        destPath = path.join(job.outputDir, `${baseName} (${counter})${ext}`);
        counter++;
      }

      ensureDir(job.outputDir);
      fs.copyFileSync(tempFile, destPath);
      fs.unlinkSync(tempFile);
      return destPath;
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

  /**
   * storeQualityOption is no longer needed — kept for API compat.
   */
  storeQualityOption(_jobId: string, _option: unknown): void {
    // no-op: quality option is now stored at startDownload time
  }

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
