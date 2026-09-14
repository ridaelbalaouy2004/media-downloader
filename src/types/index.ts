// Shared types (mirrors electron/types.ts for renderer use)

export interface MediaFormat {
  formatId: string;
  ext: string;
  resolution: string;
  fps: number | null;
  vcodec: string;
  acodec: string;
  filesize: number | null;
  tbr: number | null;
  quality: number;
  hasVideo: boolean;
  hasAudio: boolean;
  label: string;
}

export type PlatformType = 'youtube' | 'instagram' | 'facebook' | 'tiktok' | 'image' | 'generic';

export interface MediaInfo {
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  durationStr: string;
  uploader: string;
  uploadDate: string;
  viewCount: number | null;
  formats: MediaFormat[];
  qualityOptions: QualityOption[];
  webpageUrl: string;
  platform?: PlatformType;
}

export interface QualityOption {
  id: string;
  label: string;
  height: number;
  formatTag: string;
  videoFormatId: string | null;
  audioFormatId: string | null;
  needsMerge: boolean;
  estimatedSize: number | null;
  isAudioOnly: boolean;
  mediaType?: 'video' | 'audio' | 'image';
}

export type DownloadStatus =
  | 'queued'
  | 'analyzing'
  | 'downloading'
  | 'merging'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface DownloadProgress {
  jobId: string;
  status: DownloadStatus;
  stage: string;
  percent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  speed: string | null;
  eta: string | null;
  filename: string | null;
}

export interface DownloadJob {
  jobId: string;
  url: string;
  title: string;
  thumbnail: string;
  qualityLabel: string;
  format: string;
  outputDir: string;
  outputFile: string | null;
  status: DownloadStatus;
  progress: DownloadProgress;
  startTime: number;
  endTime: number | null;
  error: string | null;
  errorDetails: string | null;
}

export interface DownloadHistoryEntry {
  jobId: string;
  url: string;
  title: string;
  thumbnail: string;
  qualityLabel: string;
  format: string;
  outputFile: string;
  outputDir: string;
  status: DownloadStatus;
  startTime: number;
  endTime: number | null;
  fileSize: number | null;
}

export interface AppSettings {
  defaultDownloadDir: string;
  defaultQuality: string;
  defaultFormat: string;
  maxConcurrentDownloads: number;
  theme: 'dark' | 'light';
  autoCheckYtDlpUpdates: boolean;
  autoCheckFfmpegUpdates: boolean;
}

export interface DiagnosticsResult {
  ytDlpFound: boolean;
  ytDlpVersion: string | null;
  ytDlpPath: string;
  ffmpegFound: boolean;
  ffmpegVersion: string | null;
  ffmpegPath: string;
  ffprobeFound: boolean;
  ffprobePath: string;
  storageWritable: boolean;
  tempDirWritable: boolean;
}

export interface StartDownloadOptions {
  url: string;
  qualityOption: QualityOption;
  outputDir: string;
  title: string;
  thumbnail: string;
}
