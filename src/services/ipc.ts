// Type-safe wrapper around window.electronAPI
// This ensures the renderer always calls IPC through properly typed methods

import type {
  MediaInfo,
  StartDownloadOptions,
  DownloadJob,
  DownloadProgress,
  DiagnosticsResult,
  AppSettings,
  DownloadHistoryEntry,
  QualityOption,
  PlaylistInfo,
  QueueStats,
} from '../types';

// The shape of the API exposed by preload.ts via contextBridge
// Declared inline to avoid importing Electron modules into the renderer bundle
interface ElectronAPI {
  analyzeUrl: (url: string) => Promise<{ success: boolean; data?: MediaInfo; error?: string }>;
  startDownload: (opts: StartDownloadOptions) => Promise<{ success: boolean; jobId?: string; error?: string }>;
  cancelDownload: (jobId: string) => Promise<{ success: boolean }>;
  pauseDownload: (jobId: string) => Promise<{ success: boolean }>;
  resumeDownload: (jobId: string) => Promise<{ success: boolean }>;
  retryDownload: (jobId: string) => Promise<{ success: boolean }>;
  pauseAll: () => Promise<{ success: boolean }>;
  resumeAll: () => Promise<{ success: boolean }>;
  cancelAll: () => Promise<{ success: boolean }>;
  clearCompleted: () => Promise<{ success: boolean }>;
  clearFailed: () => Promise<{ success: boolean }>;
  setConcurrency: (n: number) => Promise<{ success: boolean; data?: number }>;
  getConcurrency: () => Promise<{ success: boolean; data?: number }>;
  getQueueStats: () => Promise<{ success: boolean; data?: QueueStats }>;
  getPlaylistInfo: (url: string) => Promise<{ success: boolean; data?: PlaylistInfo; error?: string }>;
  startPlaylistDownload: (opts: { playlist: PlaylistInfo; qualityOption: QualityOption; outputDir: string }) => Promise<{ success: boolean; jobIds?: string[]; error?: string }>;
  getJobs: () => Promise<{ success: boolean; data?: DownloadJob[] }>;
  dismissJob: (jobId: string) => Promise<{ success: boolean }>;
  getHistory: () => Promise<{ success: boolean; data?: DownloadHistoryEntry[] }>;
  removeHistoryEntry: (jobId: string) => Promise<{ success: boolean }>;
  clearHistory: () => Promise<{ success: boolean }>;
  chooseFolder: () => Promise<{ success: boolean; cancelled: boolean; path: string | null }>;
  openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  openFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  showItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  deleteFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  runDiagnostics: () => Promise<{ success: boolean; data?: DiagnosticsResult }>;
  getSettings: () => Promise<{ success: boolean; data?: AppSettings }>;
  setSetting: (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => Promise<{ success: boolean }>;
  resetSettings: () => Promise<{ success: boolean }>;
  getAppVersion: () => Promise<{ success: boolean; data?: string }>;
  getDefaultDownloadsDir: () => Promise<{ success: boolean; data?: string }>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  onJobUpdate: (callback: (job: DownloadJob) => void) => () => void;
  onWindowMaximized: (callback: (isMaximized: boolean) => void) => () => void;
  onCompletedNotification: (callback: (data: { title: string }) => void) => () => void;
}

// Detect if we're running inside Electron (preload has set window.electronAPI)
function isElectron(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

// No-op mock used when running in a plain browser (e.g., during dev preview).
// In production, electronAPI is always present via preload.ts.
const noopAPI: ElectronAPI = {
  analyzeUrl: async () => ({ success: false, error: 'Not running in Electron' }),
  startDownload: async () => ({ success: false, error: 'Not running in Electron' }),
  cancelDownload: async () => ({ success: false }),
  pauseDownload: async () => ({ success: true }),
  resumeDownload: async () => ({ success: true }),
  retryDownload: async () => ({ success: true }),
  pauseAll: async () => ({ success: true }),
  resumeAll: async () => ({ success: true }),
  cancelAll: async () => ({ success: true }),
  clearCompleted: async () => ({ success: true }),
  clearFailed: async () => ({ success: true }),
  setConcurrency: async (n: number) => ({ success: true, data: n }),
  getConcurrency: async () => ({ success: true, data: 1 }),
  getQueueStats: async () => ({ success: true, data: { active: 0, waiting: 0, paused: 0, completed: 0, failed: 0, total: 0 } }),
  getPlaylistInfo: async () => ({ success: false, error: 'Not in Electron' }),
  startPlaylistDownload: async () => ({ success: false, error: 'Not in Electron' }),
  getJobs: async () => ({ success: true, data: [] }),
  dismissJob: async () => ({ success: true }),
  getHistory: async () => ({ success: true, data: [] }),
  removeHistoryEntry: async () => ({ success: true }),
  clearHistory: async () => ({ success: true }),
  chooseFolder: async () => ({ success: true, cancelled: true, path: null }),
  openFile: async () => ({ success: false, error: 'Not in Electron' }),
  openFolder: async () => ({ success: false, error: 'Not in Electron' }),
  showItemInFolder: async () => ({ success: false, error: 'Not in Electron' }),
  deleteFile: async () => ({ success: false, error: 'Not in Electron' }),
  deleteFolder: async () => ({ success: false, error: 'Not in Electron' }),
  openExternal: async (url: string) => {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to open link' };
    }
  },
  runDiagnostics: async () => ({ success: true, data: { ytDlpFound: false, ytDlpVersion: null, ytDlpPath: 'N/A (browser)', ffmpegFound: false, ffmpegVersion: null, ffmpegPath: 'N/A (browser)', ffprobeFound: false, ffprobePath: 'N/A (browser)', storageWritable: false, tempDirWritable: false } }),
  getSettings: async () => ({ success: true, data: { defaultDownloadDir: '', defaultQuality: '1080p', defaultFormat: 'mp4', maxConcurrentDownloads: 1, theme: 'dark', autoCheckYtDlpUpdates: false, autoCheckFfmpegUpdates: false } }),
  setSetting: async () => ({ success: true }),
  resetSettings: async () => ({ success: true }),
  getAppVersion: async () => ({ success: true, data: '1.0.0' }),
  getDefaultDownloadsDir: async () => ({ success: true, data: '' }),
  minimizeWindow: () => {},
  maximizeWindow: () => {},
  closeWindow: () => {},
  onDownloadProgress: () => () => {},
  onJobUpdate: () => () => {},
  onWindowMaximized: () => () => {},
  onCompletedNotification: () => () => {},
};

// Access the contextBridge API safely
function getAPI(): ElectronAPI {
  if (!isElectron()) {
    return noopAPI;
  }
  return (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;
}

export const ipc = {
  // ─── Media & Queue ────────────────────────────────────────────────────────
  analyzeUrl: (url: string) => getAPI().analyzeUrl(url),
  startDownload: (opts: StartDownloadOptions) => getAPI().startDownload(opts),
  cancelDownload: (jobId: string) => getAPI().cancelDownload(jobId),
  pauseDownload: (jobId: string) => getAPI().pauseDownload(jobId),
  resumeDownload: (jobId: string) => getAPI().resumeDownload(jobId),
  retryDownload: (jobId: string) => getAPI().retryDownload(jobId),
  pauseAll: () => getAPI().pauseAll(),
  resumeAll: () => getAPI().resumeAll(),
  cancelAll: () => getAPI().cancelAll(),
  clearCompleted: () => getAPI().clearCompleted(),
  clearFailed: () => getAPI().clearFailed(),
  setConcurrency: (n: number) => getAPI().setConcurrency(n),
  getConcurrency: () => getAPI().getConcurrency(),
  getQueueStats: () => getAPI().getQueueStats(),
  getPlaylistInfo: (url: string) => getAPI().getPlaylistInfo(url),
  startPlaylistDownload: (opts: { playlist: PlaylistInfo; qualityOption: QualityOption; outputDir: string }) =>
    getAPI().startPlaylistDownload(opts),
  getJobs: () => getAPI().getJobs(),
  dismissJob: (jobId: string) => getAPI().dismissJob(jobId),

  // ─── History ──────────────────────────────────────────────────────────────
  getHistory: () => getAPI().getHistory(),
  removeHistoryEntry: (jobId: string) => getAPI().removeHistoryEntry(jobId),
  clearHistory: () => getAPI().clearHistory(),

  // ─── File System ──────────────────────────────────────────────────────────
  chooseFolder: () => getAPI().chooseFolder(),
  openFile: (filePath: string) => getAPI().openFile(filePath),
  openFolder: (filePath: string) => getAPI().openFolder(filePath),
  showItemInFolder: (filePath: string) => getAPI().showItemInFolder(filePath),
  deleteFile: (filePath: string) => getAPI().deleteFile(filePath),
  deleteFolder: (folderPath: string) => getAPI().deleteFolder(folderPath),
  openExternal: (url: string) => getAPI().openExternal(url),

  // ─── Diagnostics ─────────────────────────────────────────────────────────
  runDiagnostics: () => getAPI().runDiagnostics(),

  // ─── Settings ─────────────────────────────────────────────────────────────
  getSettings: () => getAPI().getSettings(),
  setSetting: (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) =>
    getAPI().setSetting(key, value),
  resetSettings: () => getAPI().resetSettings(),

  // ─── App Info ─────────────────────────────────────────────────────────────
  getAppVersion: () => getAPI().getAppVersion(),
  getDefaultDownloadsDir: () => getAPI().getDefaultDownloadsDir(),

  // ─── Window Controls ──────────────────────────────────────────────────────
  minimizeWindow: () => getAPI().minimizeWindow(),
  maximizeWindow: () => getAPI().maximizeWindow(),
  closeWindow: () => getAPI().closeWindow(),

  // ─── Event Listeners ─────────────────────────────────────────────────────
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) =>
    getAPI().onDownloadProgress(callback),

  onJobUpdate: (callback: (job: DownloadJob) => void) =>
    getAPI().onJobUpdate(callback),

  onWindowMaximized: (callback: (isMaximized: boolean) => void) =>
    getAPI().onWindowMaximized(callback),

  onCompletedNotification: (callback: (data: { title: string }) => void) =>
    getAPI().onCompletedNotification(callback),
};

// ─── Utility Functions ────────────────────────────────────────────────────────

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDate(timestamp: number | null): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
