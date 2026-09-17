import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';

/**
 * Determine if running in development mode.
 * Safe check even before app is fully ready.
 */
export function isDevelopment(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (!app) return true;
  return !app.isPackaged;
}

/**
 * Get project root path reliably.
 */
export function getProjectRoot(): string {
  if (app && typeof app.getAppPath === 'function') {
    const appPath = app.getAppPath();
    // If running in dist-electron/..., step up
    if (appPath.endsWith('dist-electron')) {
      return path.resolve(appPath, '..');
    }
    return appPath;
  }
  return process.cwd();
}

/**
 * Get the path to a bundled binary (yt-dlp.exe, ffmpeg.exe, ffprobe.exe).
 * - In development (npm run dev): checks project resources/bin/ using multiple safe fallback strategies.
 *   DO NOT use process.resourcesPath in development.
 * - In production (packaged): checks process.resourcesPath/bin, process.resourcesPath, and next to executable.
 */
export function getBinaryPath(binaryName: string): string {
  const binaryFile = binaryName.endsWith('.exe') ? binaryName : `${binaryName}.exe`;

  // Explicit environment variable override takes top priority
  const envKey = binaryName.toUpperCase().replace(/-/g, '_') + '_PATH';
  const envPath = process.env[envKey];
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const devMode = isDevelopment();

  if (!devMode && process.resourcesPath) {
    // Packaged Electron app (via electron-builder extraResources)
    const packagedCandidates = [
      path.join(process.resourcesPath, 'bin', binaryFile),
      path.join(process.resourcesPath, 'resources', 'bin', binaryFile),
      path.join(process.resourcesPath, binaryFile),
    ];

    if (app && typeof app.getPath === 'function') {
      try {
        const exeDir = path.dirname(app.getPath('exe'));
        packagedCandidates.push(
          path.join(exeDir, 'resources', 'bin', binaryFile),
          path.join(exeDir, 'bin', binaryFile),
          path.join(exeDir, binaryFile)
        );
      } catch {
        // ignore
      }
    }

    for (const candidate of packagedCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Default to standard packaged path
    return packagedCandidates[0];
  }

  // Development mode: find resources/bin relative to project root / cwd / __dirname
  const root = getProjectRoot();
  const devCandidates = [
    path.join(root, 'resources', 'bin', binaryFile),
    path.join(process.cwd(), 'resources', 'bin', binaryFile),
    path.resolve(__dirname, '..', '..', 'resources', 'bin', binaryFile),
    path.resolve(__dirname, '..', 'resources', 'bin', binaryFile),
    path.resolve(__dirname, 'resources', 'bin', binaryFile),
  ];

  for (const candidate of devCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback to first dev candidate even if missing (helps with diagnostic errors)
  return devCandidates[0];
}

export function getYtDlpPath(): string {
  return getBinaryPath('yt-dlp');
}

export function getFfmpegPath(): string {
  return getBinaryPath('ffmpeg');
}

export function getFfprobePath(): string {
  return getBinaryPath('ffprobe');
}

/**
 * Get the directory containing ffmpeg and ffprobe.
 */
export function getFfmpegDir(): string {
  return path.dirname(getFfmpegPath());
}

/**
 * Get the app's data directory for storing settings and history.
 */
export function getAppDataDir(): string {
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'MediaDownloader');
  }
  const appData = process.env.APPDATA || process.env.HOME || process.cwd();
  return path.join(appData, 'MediaDownloader');
}

/**
 * Get the temp directory for download jobs.
 */
export function getTempDir(): string {
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('temp'), 'media-downloader');
  }
  const tmp = process.env.TEMP || os.tmpdir();
  return path.join(tmp, 'media-downloader');
}

/**
 * Get the job temp directory.
 */
export function getJobTempDir(jobId: string): string {
  return path.join(getTempDir(), jobId);
}

/**
 * Ensure a directory exists, creating it if necessary.
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export const isDev = isDevelopment();

