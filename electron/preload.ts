import { contextBridge, ipcRenderer } from 'electron';
import type {
  MediaInfo,
  StartDownloadOptions,
  DownloadJob,
  DownloadProgress,
  DiagnosticsResult,
  AppSettings,
  DownloadHistoryEntry,
  PlaylistInfo,
  QualityOption,
  QueueStats,
} from './types';

// Safe type-checked API exposed to renderer
const api = {
  // ─── Media & Queue ────────────────────────────────────────────────────────
  analyzeUrl: (url: string) =>
    ipcRenderer.invoke('media:analyze', url) as Promise<{
      success: boolean;
      data?: MediaInfo;
      error?: string;
    }>,

  startDownload: (opts: StartDownloadOptions) =>
    ipcRenderer.invoke('media:start-download', opts) as Promise<{
      success: boolean;
      jobId?: string;
      error?: string;
    }>,

  cancelDownload: (jobId: string) =>
    ipcRenderer.invoke('media:cancel-download', jobId) as Promise<{ success: boolean }>,

  pauseDownload: (jobId: string) =>
    ipcRenderer.invoke('media:pause-download', jobId) as Promise<{ success: boolean }>,

  resumeDownload: (jobId: string) =>
    ipcRenderer.invoke('media:resume-download', jobId) as Promise<{ success: boolean }>,

  retryDownload: (jobId: string) =>
    ipcRenderer.invoke('media:retry-download', jobId) as Promise<{ success: boolean }>,

  pauseAll: () =>
    ipcRenderer.invoke('media:pause-all') as Promise<{ success: boolean }>,

  resumeAll: () =>
    ipcRenderer.invoke('media:resume-all') as Promise<{ success: boolean }>,

  cancelAll: () =>
    ipcRenderer.invoke('media:cancel-all') as Promise<{ success: boolean }>,

  clearCompleted: () =>
    ipcRenderer.invoke('media:clear-completed') as Promise<{ success: boolean }>,

  clearFailed: () =>
    ipcRenderer.invoke('media:clear-failed') as Promise<{ success: boolean }>,

  setConcurrency: (n: number) =>
    ipcRenderer.invoke('media:set-concurrency', n) as Promise<{ success: boolean; data?: number }>,

  getConcurrency: () =>
    ipcRenderer.invoke('media:get-concurrency') as Promise<{ success: boolean; data?: number }>,

  getQueueStats: () =>
    ipcRenderer.invoke('media:get-queue-stats') as Promise<{ success: boolean; data?: QueueStats }>,

  getPlaylistInfo: (url: string) =>
    ipcRenderer.invoke('media:get-playlist-info', url) as Promise<{
      success: boolean;
      data?: PlaylistInfo;
      error?: string;
    }>,

  startPlaylistDownload: (opts: { playlist: PlaylistInfo; qualityOption: QualityOption; outputDir: string }) =>
    ipcRenderer.invoke('media:start-playlist-download', opts) as Promise<{
      success: boolean;
      jobIds?: string[];
      error?: string;
    }>,

  getJobs: () =>
    ipcRenderer.invoke('media:get-jobs') as Promise<{
      success: boolean;
      data?: DownloadJob[];
    }>,

  dismissJob: (jobId: string) =>
    ipcRenderer.invoke('media:dismiss-job', jobId) as Promise<{ success: boolean }>,

  // ─── History ──────────────────────────────────────────────────────────────
  getHistory: () =>
    ipcRenderer.invoke('history:get') as Promise<{
      success: boolean;
      data?: DownloadHistoryEntry[];
    }>,

  removeHistoryEntry: (jobId: string) =>
    ipcRenderer.invoke('history:remove', jobId) as Promise<{ success: boolean }>,

  clearHistory: () =>
    ipcRenderer.invoke('history:clear') as Promise<{ success: boolean }>,

  // ─── File System ──────────────────────────────────────────────────────────
  chooseFolder: () =>
    ipcRenderer.invoke('system:choose-folder') as Promise<{
      success: boolean;
      cancelled: boolean;
      path: string | null;
    }>,

  openFile: (filePath: string) =>
    ipcRenderer.invoke('system:open-file', filePath) as Promise<{
      success: boolean;
      error?: string;
    }>,

  openFolder: (filePath: string) =>
    ipcRenderer.invoke('system:open-folder', filePath) as Promise<{
      success: boolean;
      error?: string;
    }>,

  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('system:show-item-in-folder', filePath) as Promise<{
      success: boolean;
      error?: string;
    }>,

  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('system:delete-file', filePath) as Promise<{
      success: boolean;
      error?: string;
    }>,

  deleteFolder: (folderPath: string) =>
    ipcRenderer.invoke('system:delete-folder', folderPath) as Promise<{
      success: boolean;
      error?: string;
    }>,

  openExternal: (url: string) =>
    ipcRenderer.invoke('system:open-external', url) as Promise<{
      success: boolean;
      error?: string;
    }>,

  // ─── Diagnostics ─────────────────────────────────────────────────────────
  runDiagnostics: () =>
    ipcRenderer.invoke('system:diagnostics') as Promise<{
      success: boolean;
      data?: DiagnosticsResult;
    }>,

  // ─── Settings ─────────────────────────────────────────────────────────────
  getSettings: () =>
    ipcRenderer.invoke('settings:get') as Promise<{
      success: boolean;
      data?: AppSettings;
    }>,

  setSetting: (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) =>
    ipcRenderer.invoke('settings:set', key, value) as Promise<{ success: boolean }>,

  resetSettings: () =>
    ipcRenderer.invoke('settings:reset') as Promise<{ success: boolean }>,

  // ─── App Info ─────────────────────────────────────────────────────────────
  getAppVersion: () =>
    ipcRenderer.invoke('app:get-version') as Promise<{
      success: boolean;
      data?: string;
    }>,

  getDefaultDownloadsDir: () =>
    ipcRenderer.invoke('app:get-downloads-dir') as Promise<{
      success: boolean;
      data?: string;
    }>,

  // ─── Window Controls ──────────────────────────────────────────────────────
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // ─── Event Listeners ─────────────────────────────────────────────────────
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: DownloadProgress) => {
      callback(progress);
    };
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  },

  onJobUpdate: (callback: (job: DownloadJob) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, job: DownloadJob) => {
      callback(job);
    };
    ipcRenderer.on('download:job-update', handler);
    return () => ipcRenderer.removeListener('download:job-update', handler);
  },

  onWindowMaximized: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => {
      callback(isMaximized);
    };
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },

  onCompletedNotification: (callback: (data: { title: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { title: string }) => {
      callback(data);
    };
    ipcRenderer.on('download:completed-notification', handler);
    return () => ipcRenderer.removeListener('download:completed-notification', handler);
  },
};

// Expose safe API to renderer via contextBridge
contextBridge.exposeInMainWorld('electronAPI', api);
