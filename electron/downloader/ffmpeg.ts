import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getFfmpegPath, getFfprobePath } from '../utils/paths';
import { processManager } from './processManager';
import type { DownloadProgress } from '../types';

/**
 * Merge a separate video and audio file into a single output file.
 * Uses -c copy (stream copy) when possible to avoid re-encoding.
 */
export async function mergeVideoAudio(opts: {
  jobId: string;
  videoFile: string;
  audioFile: string;
  outputFile: string;
  container: 'mp4' | 'webm' | 'mkv';
  onProgress: (progress: Partial<DownloadProgress>) => void;
  onError: (error: string, details?: string) => void;
}): Promise<boolean> {
  const { jobId, videoFile, audioFile, outputFile, container, onProgress, onError } = opts;
  const ffmpegPath = getFfmpegPath();

  if (!fs.existsSync(ffmpegPath)) {
    onError(`FFmpeg not found at: ${ffmpegPath}`, 'Please place ffmpeg.exe in resources/bin/');
    return false;
  }

  onProgress({ status: 'merging', stage: 'Merging video and audio...', percent: null });

  // Build FFmpeg args safely as array
  const args: string[] = [
    '-y', // Overwrite output
    '-i', videoFile,
    '-i', audioFile,
    '-c', 'copy', // Stream copy — no re-encoding
  ];

  // For MP4, ensure moov atom at start for streaming
  if (container === 'mp4') {
    args.push('-movflags', '+faststart');
  }

  // Output file
  args.push(outputFile);

  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    processManager.register(jobId, proc);

    let stderrBuffer = '';
    let duration: number | null = null;

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;

      // Parse FFmpeg progress
      parseFfmpegProgress(text, duration, (d) => { duration = d; }, onProgress);
    });

    proc.stdout.on('data', () => { /* FFmpeg outputs to stderr */ });

    proc.on('error', (err) => {
      onError(`FFmpeg process error: ${err.message}`);
      resolve(false);
    });

    proc.on('close', (code) => {
      if (code === null) {
        // Killed (cancelled)
        resolve(false);
        return;
      }

      if (code !== 0) {
        const errMsg = parseFfmpegError(stderrBuffer);
        onError(errMsg, stderrBuffer);
        resolve(false);
        return;
      }

      onProgress({ status: 'finalizing', stage: 'Finalizing...', percent: 100 });
      resolve(true);
    });
  });
}

/**
 * Convert an audio file to a different format (e.g., to MP3).
 */
export async function convertAudio(opts: {
  jobId: string;
  inputFile: string;
  outputFile: string;
  format: 'mp3' | 'm4a' | 'opus';
  onProgress: (progress: Partial<DownloadProgress>) => void;
  onError: (error: string, details?: string) => void;
}): Promise<boolean> {
  const { jobId, inputFile, outputFile, format, onProgress, onError } = opts;
  const ffmpegPath = getFfmpegPath();

  if (!fs.existsSync(ffmpegPath)) {
    onError(`FFmpeg not found: ${ffmpegPath}`);
    return false;
  }

  onProgress({ status: 'merging', stage: `Converting to ${format.toUpperCase()}...`, percent: null });

  const args: string[] = ['-y', '-i', inputFile];

  if (format === 'mp3') {
    args.push('-c:a', 'libmp3lame', '-q:a', '0');
  } else if (format === 'm4a') {
    args.push('-c:a', 'aac', '-b:a', '192k');
  } else if (format === 'opus') {
    args.push('-c:a', 'libopus', '-b:a', '160k');
  }

  args.push(outputFile);

  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    processManager.register(jobId, proc);

    let stderrBuffer = '';
    let duration: number | null = null;

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;
      parseFfmpegProgress(text, duration, (d) => { duration = d; }, onProgress);
    });

    proc.on('error', (err) => {
      onError(`FFmpeg error: ${err.message}`);
      resolve(false);
    });

    proc.on('close', (code) => {
      if (code === null) { resolve(false); return; }
      if (code !== 0) {
        onError(parseFfmpegError(stderrBuffer), stderrBuffer);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

/**
 * Get media info using ffprobe.
 */
export async function probeFile(filePath: string): Promise<Record<string, unknown> | null> {
  const ffprobePath = getFfprobePath();
  if (!fs.existsSync(ffprobePath)) return null;

  return new Promise((resolve) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    const proc = spawn(ffprobePath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout) as Record<string, unknown>);
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
    proc.on('error', () => resolve(null));
  });
}

/**
 * Get FFmpeg version string.
 */
export async function getFfmpegVersion(): Promise<string | null> {
  const ffmpegPath = getFfmpegPath();
  if (!fs.existsSync(ffmpegPath)) return null;

  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-version'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    proc.on('close', () => {
      const match = output.match(/ffmpeg version (\S+)/);
      resolve(match ? match[1] : output.split('\n')[0]);
    });
    proc.on('error', () => resolve(null));
  });
}

/**
 * Parse FFmpeg stderr for progress information.
 * FFmpeg outputs: time=HH:MM:SS.ms bitrate=...
 */
function parseFfmpegProgress(
  text: string,
  duration: number | null,
  setDuration: (d: number) => void,
  onProgress: (p: Partial<DownloadProgress>) => void
): void {
  // Extract total duration from FFmpeg info
  const durMatch = text.match(/Duration:\s+(\d+):(\d+):(\d+\.?\d*)/);
  if (durMatch && !duration) {
    const totalSeconds =
      parseInt(durMatch[1]) * 3600 +
      parseInt(durMatch[2]) * 60 +
      parseFloat(durMatch[3]);
    setDuration(totalSeconds);
  }

  // Parse current time position
  const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
  if (timeMatch && duration && duration > 0) {
    const currentSeconds =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseFloat(timeMatch[3]);
    const percent = Math.min(100, Math.round((currentSeconds / duration) * 100));
    onProgress({ status: 'merging', stage: 'Merging video and audio...', percent });
  }
}

/**
 * Parse FFmpeg stderr for user-friendly error messages.
 */
function parseFfmpegError(stderr: string): string {
  if (!stderr) return 'FFmpeg processing failed.';

  if (stderr.includes('No such file or directory')) {
    return 'FFmpeg could not find the input file. Download may have failed.';
  }
  if (stderr.includes('Invalid data found')) {
    return 'Downloaded file appears corrupted. Please try again.';
  }
  if (stderr.includes('Permission denied')) {
    return 'Permission denied. Cannot write to the output location.';
  }
  if (stderr.includes('codec not currently supported in container')) {
    return 'The selected video codec is not compatible with the chosen container format.';
  }

  const errorLine = stderr.split('\n').find(l => l.includes('Error') || l.includes('error'));
  if (errorLine) return `FFmpeg error: ${errorLine.trim()}`;

  return 'FFmpeg processing failed. Please try a different quality or format.';
}
