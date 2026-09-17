import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { analyzeUrl, getYtDlpVersion, validateVideoUrl, getPlaylistInfo } from '../downloader/ytdlp';
import { getFfmpegVersion } from '../downloader/ffmpeg';
import { downloadManager } from '../downloader/downloadManager';
import { getYtDlpPath, getFfmpegPath, getFfprobePath, getTempDir } from '../utils/paths';
import { getHistory, removeHistoryEntry, clearHistory } from '../utils/history';
import { isDirectoryWritable } from '../utils/diskSpace';
import { sanitizeWindowsName, sanitizePath, safeJoinPath } from '../utils/sanitize';
import type { DiagnosticsResult, StartDownloadOptions, PlaylistInfo, QualityOption } from '../types';

// Settings storage using electron-store
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require('electron-store');

interface Settings {
  defaultDownloadDir: string;
  defaultQuality: string;
  defaultFormat: string;
  maxConcurrentDownloads: number;
  theme: 'dark' | 'light';
  autoCheckYtDlpUpdates: boolean;
  autoCheckFfmpegUpdates: boolean;
}

// electron-store is required via require() for CommonJS compat
const store = new Store({
  defaults: {
    defaultDownloadDir: app.getPath('downloads'),
    defaultQuality: '1080p',
    defaultFormat: 'mp4',
    maxConcurrentDownloads: 1,
    theme: 'dark',
    autoCheckYtDlpUpdates: false,
    autoCheckFfmpegUpdates: false,
  },
});

export function registerIpcHandlers(): void {
  // Synchronize initial concurrency setting
  downloadManager.setMaxConcurrent(store.get('maxConcurrentDownloads') || 1);
  // ─── Media Analysis ─────────────────────────────────────────────────────────

  ipcMain.handle('media:analyze', async (_event, url: string) => {
    try {
      const validation = validateVideoUrl(url);
      if (!validation.valid) {
        return { success: false, error: validation.error || 'Invalid video URL.' };
      }

      const info = await analyzeUrl(url.trim());
      return { success: true, data: info };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // ─── Download Management ─────────────────────────────────────────────────────

  ipcMain.handle('media:start-download', async (_event, opts: StartDownloadOptions) => {
    try {
      if (!opts || !opts.url) {
        return { success: false, error: 'Download options with URL are required.' };
      }

      const validation = validateVideoUrl(opts.url);
      if (!validation.valid) {
        return { success: false, error: validation.error || 'Invalid video URL.' };
      }

      // Check and ensure output directory exists with strict Windows sanitization
      let targetDir = opts.outputDir || store.get('defaultDownloadDir') || app.getPath('downloads');
      targetDir = sanitizePath(targetDir);
      if (opts.isPlaylist && opts.playlistTitle) {
        const safeFolder = sanitizeWindowsName(opts.playlistTitle);
        if (path.basename(targetDir) !== safeFolder) {
          targetDir = safeJoinPath(targetDir, safeFolder);
        }
      }
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      opts.outputDir = targetDir;

      const jobId = downloadManager.startDownload(opts);
      return { success: true, jobId };
    } catch (err: unknown) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('media:cancel-download', async (_event, jobId: string) => {
    downloadManager.cancelDownload(jobId);
    return { success: true };
  });

  ipcMain.handle('media:pause-download', async (_event, jobId: string) => {
    const paused = downloadManager.pauseJob(jobId);
    return { success: paused };
  });

  ipcMain.handle('media:resume-download', async (_event, jobId: string) => {
    const resumed = downloadManager.resumeJob(jobId);
    return { success: resumed };
  });

  ipcMain.handle('media:retry-download', async (_event, jobId: string) => {
    const retried = downloadManager.retryJob(jobId);
    return { success: retried };
  });

  ipcMain.handle('media:pause-all', async () => {
    downloadManager.pauseAll();
    return { success: true };
  });

  ipcMain.handle('media:resume-all', async () => {
    downloadManager.resumeAll();
    return { success: true };
  });

  ipcMain.handle('media:cancel-all', async () => {
    downloadManager.cancelAll();
    return { success: true };
  });

  ipcMain.handle('media:clear-completed', async () => {
    downloadManager.clearCompleted();
    return { success: true };
  });

  ipcMain.handle('media:clear-failed', async () => {
    downloadManager.clearFailed();
    return { success: true };
  });

  ipcMain.handle('media:set-concurrency', async (_event, n: number) => {
    const count = Math.max(1, Math.min(3, n));
    downloadManager.setMaxConcurrent(count);
    store.set('maxConcurrentDownloads', count);
    return { success: true, data: count };
  });

  ipcMain.handle('media:get-concurrency', async () => {
    return { success: true, data: downloadManager.getMaxConcurrent() };
  });

  ipcMain.handle('media:get-queue-stats', async () => {
    return { success: true, data: downloadManager.getQueueStats() };
  });

  ipcMain.handle('media:get-playlist-info', async (_event, url: string) => {
    try {
      const info = await getPlaylistInfo(url);
      return { success: true, data: info };
    } catch (err: unknown) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('media:start-playlist-download', async (_event, opts: { playlist: PlaylistInfo; qualityOption: QualityOption; outputDir: string }) => {
    try {
      const baseDir = sanitizePath(opts.outputDir || store.get('defaultDownloadDir') || app.getPath('downloads'));
      const safePlaylistFolder = sanitizeWindowsName(opts.playlist.title);
      const playlistDir = path.resolve(safeJoinPath(baseDir, safePlaylistFolder));
      if (!fs.existsSync(playlistDir)) {
        fs.mkdirSync(playlistDir, { recursive: true });
      }
      const jobIds = downloadManager.startPlaylistDownload(opts.playlist, opts.qualityOption, baseDir);
      return { success: true, jobIds };
    } catch (err: unknown) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('media:get-jobs', async () => {
    return { success: true, data: downloadManager.getJobs() };
  });

  ipcMain.handle('media:dismiss-job', async (_event, jobId: string) => {
    const removed = downloadManager.dismissJob(jobId);
    return { success: removed };
  });

  // ─── Download History ────────────────────────────────────────────────────────

  ipcMain.handle('history:get', async () => {
    return { success: true, data: getHistory() };
  });

  ipcMain.handle('history:remove', async (_event, jobId: string) => {
    removeHistoryEntry(jobId);
    return { success: true };
  });

  ipcMain.handle('history:clear', async () => {
    clearHistory();
    return { success: true };
  });

  // ─── File System ─────────────────────────────────────────────────────────────

  ipcMain.handle('system:choose-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Download Folder',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, cancelled: true, path: null };
    }

    return { success: true, cancelled: false, path: result.filePaths[0] };
  });

  ipcMain.handle('system:open-file', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      console.warn('[OPEN FILE] No file path specified.');
      return { success: false, error: 'No file path specified.' };
    }

    let cleanPath = path.resolve(path.normalize(filePath));
    if (!fs.existsSync(cleanPath)) {
      const sanitized = sanitizePath(cleanPath);
      if (fs.existsSync(sanitized)) {
        cleanPath = sanitized;
      }
    }
    const exists = fs.existsSync(cleanPath);
    console.log(`[OPEN FILE]\nPATH: ${cleanPath}\nFILE EXISTS: ${exists}`);

    if (!exists) {
      return {
        success: false,
        error: `File does not exist: "${cleanPath}". It may have been moved, renamed, or deleted.`,
      };
    }

    const openError = await shell.openPath(cleanPath);
    if (openError) {
      console.error(`[OPEN FILE] Failed to open "${cleanPath}":`, openError);
      return { success: false, error: `Could not open file: ${openError}` };
    }
    return { success: true };
  });

  ipcMain.handle('system:open-folder', async (_event, targetPath: string) => {
    if (!targetPath || typeof targetPath !== 'string') {
      console.warn('[OPEN FOLDER] No folder path specified.');
      return { success: false, error: 'No folder path specified.' };
    }

    let cleanPath = path.resolve(path.normalize(targetPath));
    if (!fs.existsSync(cleanPath)) {
      const sanitized = sanitizePath(cleanPath);
      if (fs.existsSync(sanitized)) {
        cleanPath = sanitized;
      }
    }

    let targetDir = cleanPath;
    if (fs.existsSync(cleanPath)) {
      targetDir = fs.statSync(cleanPath).isDirectory() ? cleanPath : path.dirname(cleanPath);
    } else {
      targetDir = path.dirname(cleanPath);
    }

    const exists = fs.existsSync(targetDir);
    console.log(`[OPEN FOLDER]\nPATH: ${targetDir}\nFOLDER EXISTS: ${exists}`);

    if (!exists) {
      return {
        success: false,
        error: `Folder does not exist: "${targetDir}". It may have been moved, renamed, or deleted.`,
      };
    }

    const openError = await shell.openPath(targetDir);
    if (openError) {
      console.error(`[OPEN FOLDER] Failed to open "${targetDir}":`, openError);
      return { success: false, error: `Could not open folder: ${openError}` };
    }
    return { success: true };
  });

  ipcMain.handle('system:show-item-in-folder', async (_event, targetPath: string) => {
    if (!targetPath || typeof targetPath !== 'string') {
      console.warn('[SHOW IN FOLDER] No path specified.');
      return { success: false, error: 'No path specified.' };
    }

    let cleanPath = path.resolve(path.normalize(targetPath));
    if (!fs.existsSync(cleanPath)) {
      const sanitized = sanitizePath(cleanPath);
      if (fs.existsSync(sanitized)) {
        cleanPath = sanitized;
      }
    }

    const exists = fs.existsSync(cleanPath);
    console.log(`[SHOW IN FOLDER]\nPATH: ${cleanPath}\nITEM EXISTS: ${exists}`);

    if (exists) {
      shell.showItemInFolder(cleanPath);
      return { success: true };
    }

    // If exact item doesn't exist, check parent folder
    const parentDir = path.dirname(cleanPath);
    const parentExists = fs.existsSync(parentDir);
    console.log(`[SHOW IN FOLDER]\nFALLBACK PARENT PATH: ${parentDir}\nPARENT EXISTS: ${parentExists}`);
    if (parentExists) {
      await shell.openPath(parentDir);
      return { success: true };
    }

    return {
      success: false,
      error: `Location does not exist: "${cleanPath}". It may have been moved or deleted.`,
    };
  });

  ipcMain.handle('system:delete-file', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      console.warn('[DELETE FILE] No file path specified.');
      return { success: false, error: 'No file path specified.' };
    }

    const cleanPath = path.resolve(path.normalize(filePath));
    const exists = fs.existsSync(cleanPath);
    console.log(`[DELETE FILE]\nPATH: ${cleanPath}\nFILE EXISTS: ${exists}`);

    if (!exists) {
      return { success: false, error: `File does not exist: "${cleanPath}"` };
    }

    try {
      await fs.promises.unlink(cleanPath);
      return { success: true };
    } catch (err: unknown) {
      console.error(`[DELETE FILE] Failed to delete "${cleanPath}":`, err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('system:delete-folder', async (_event, folderPath: string) => {
    if (!folderPath || typeof folderPath !== 'string') {
      console.warn('[DELETE FOLDER] No folder path specified.');
      return { success: false, error: 'No folder path specified.' };
    }

    const cleanPath = path.resolve(path.normalize(folderPath));
    const exists = fs.existsSync(cleanPath);
    console.log(`[DELETE FOLDER]\nPATH: ${cleanPath}\nFOLDER EXISTS: ${exists}`);

    if (!exists) {
      return { success: false, error: `Folder does not exist: "${cleanPath}"` };
    }

    try {
      await fs.promises.rm(cleanPath, { recursive: true, force: true });
      return { success: true };
    } catch (err: unknown) {
      console.error(`[DELETE FOLDER] Failed to delete "${cleanPath}":`, err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('system:open-external', async (_event, url: string) => {
    try {
      if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
        await shell.openExternal(url);
        return { success: true };
      }
      return { success: false, error: 'Invalid URL format' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ─── Diagnostics ─────────────────────────────────────────────────────────────

  ipcMain.handle('system:diagnostics', async () => {
    const ytDlpPath = getYtDlpPath();
    const ffmpegPath = getFfmpegPath();
    const ffprobePath = getFfprobePath();
    const tempDir = getTempDir();

    const ytDlpFound = fs.existsSync(ytDlpPath);
    const ffmpegFound = fs.existsSync(ffmpegPath);
    const ffprobeFound = fs.existsSync(ffprobePath);

    const [ytDlpVersion, ffmpegVersion, storageWritable, tempDirWritable] = await Promise.all([
      ytDlpFound ? getYtDlpVersion() : Promise.resolve(null),
      ffmpegFound ? getFfmpegVersion() : Promise.resolve(null),
      isDirectoryWritable(app.getPath('downloads')),
      isDirectoryWritable(app.getPath('temp')),
    ]);

    const result: DiagnosticsResult = {
      ytDlpFound,
      ytDlpVersion,
      ytDlpPath,
      ffmpegFound,
      ffmpegVersion,
      ffmpegPath,
      ffprobeFound,
      ffprobePath,
      storageWritable,
      tempDirWritable,
    };

    return { success: true, data: result };
  });

  // ─── Settings ────────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', async () => {
    return { success: true, data: store.store };
  });

  ipcMain.handle('settings:set', async (_event, key: string, value: unknown) => {
    try {
      store.set(key as keyof Settings, value as Settings[keyof Settings]);

      // Apply some settings immediately
      if (key === 'maxConcurrentDownloads' && typeof value === 'number') {
        downloadManager.setMaxConcurrent(value);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('settings:reset', async () => {
    store.clear();
    return { success: true };
  });

  // ─── App Info ────────────────────────────────────────────────────────────────

  ipcMain.handle('app:get-version', async () => {
    return { success: true, data: app.getVersion() };
  });

  ipcMain.handle('app:get-downloads-dir', async () => {
    return { success: true, data: app.getPath('downloads') };
  });
}
