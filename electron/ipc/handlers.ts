import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { analyzeUrl, getYtDlpVersion, validateVideoUrl } from '../downloader/ytdlp';
import { getFfmpegVersion } from '../downloader/ffmpeg';
import { downloadManager } from '../downloader/downloadManager';
import { getYtDlpPath, getFfmpegPath, getFfprobePath, getTempDir } from '../utils/paths';
import { getHistory, removeHistoryEntry, clearHistory } from '../utils/history';
import { isDirectoryWritable } from '../utils/diskSpace';
import type { DiagnosticsResult, StartDownloadOptions } from '../types';

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
    maxConcurrentDownloads: 2,
    theme: 'dark',
    autoCheckYtDlpUpdates: false,
    autoCheckFfmpegUpdates: false,
  },
});

export function registerIpcHandlers(): void {
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

      // Check and ensure output directory exists (Requirement 15)
      const targetDir = opts.outputDir || app.getPath('downloads');
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
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found.' };
    }
    await shell.openPath(filePath);
    return { success: true };
  });

  ipcMain.handle('system:open-folder', async (_event, filePath: string) => {
    const dir = fs.existsSync(filePath)
      ? (fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath))
      : path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      return { success: false, error: 'Folder not found.' };
    }

    await shell.openPath(dir);
    return { success: true };
  });

  ipcMain.handle('system:show-item-in-folder', async (_event, filePath: string) => {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found.' };
    }
    shell.showItemInFolder(filePath);
    return { success: true };
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
