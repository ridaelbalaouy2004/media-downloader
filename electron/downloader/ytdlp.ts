import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getYtDlpPath, getFfmpegPath } from '../utils/paths';
import { parseFormat, buildQualityOptions } from './formats';
import { processManager } from './processManager';
import type { MediaInfo, DownloadProgress, QualityOption } from '../types';

/**
 * Parse duration in seconds to HH:MM:SS string.
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Get yt-dlp version for diagnostics and system checks.
 */
export async function getYtDlpVersion(): Promise<string | null> {
  const ytDlpPath = getYtDlpPath();
  if (!fs.existsSync(ytDlpPath)) return null;

  return new Promise((resolve) => {
    const proc = spawn(ytDlpPath, ['--version'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        resolve(null);
      }
    });

    proc.on('error', () => resolve(null));
  });
}

/**
 * Analyze a URL using yt-dlp --dump-json.
 * Returns parsed MediaInfo or throws a descriptive error.
 */
export async function analyzeUrl(url: string): Promise<MediaInfo> {
  const ytDlpPath = getYtDlpPath();

  if (!fs.existsSync(ytDlpPath)) {
    throw new Error(`yt-dlp not found at: ${ytDlpPath}\n\nPlease place yt-dlp.exe in the resources/bin/ directory.`);
  }

  return new Promise((resolve, reject) => {
    // --no-playlist: treat playlist URLs as single-video
    // --dump-json: output video metadata as JSON (no download)
    // NOTE: do NOT use --flat-playlist here — it returns incomplete format data
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      url,
    ];

    let stdout = '';
    let stderr = '';

    const proc = spawn(ytDlpPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        const detail = stderr.trim() || 'No output from yt-dlp';
        const firstError = detail.split('\n').find(l => l.includes('ERROR:')) || detail;
        reject(new Error(`yt-dlp failed (exit ${code}): ${firstError.replace('ERROR:', '').trim()}`));
        return;
      }

      try {
        // yt-dlp may output multiple JSON lines for playlists; take the first
        const firstLine = stdout.trim().split('\n')[0];
        const json = JSON.parse(firstLine);

        const rawFormats = (Array.isArray(json.formats) ? json.formats : []) as Record<string, unknown>[];
        const formats = rawFormats
          .map(parseFormat)
          .filter((f): f is NonNullable<ReturnType<typeof parseFormat>> => f !== null);

        const qualityOptions = buildQualityOptions(formats);

        const info: MediaInfo = {
          url,
          title: json.title || 'Unknown Title',
          thumbnail: json.thumbnail || json.thumbnails?.[json.thumbnails.length - 1]?.url || '',
          duration: json.duration || 0,
          durationStr: json.duration ? formatDuration(json.duration) : '0:00',
          uploader: json.uploader || json.channel || 'Unknown',
          uploadDate: json.upload_date || '',
          viewCount: json.view_count ?? null,
          formats,
          qualityOptions,
          webpageUrl: json.webpage_url || url,
        };

        resolve(info);
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp output: ${String(err)}`));
      }
    });
  });
}

/**
 * Validate video URL format and supported schemes.
 */
export function validateVideoUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: 'Please enter a URL.' };
  }

  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format. Please enter a valid HTTP/HTTPS URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP and HTTPS URLs are supported.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isYouTube = hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com') ||
    hostname === 'youtu.be';

  if (isYouTube) {
    if (hostname === 'youtu.be' && parsed.pathname.length <= 1) {
      return { valid: false, error: 'Invalid YouTube short URL: missing video ID.' };
    }
    if (parsed.pathname === '/watch' && !parsed.searchParams.get('v')) {
      return { valid: false, error: 'Invalid YouTube URL: missing "?v=" video ID.' };
    }
  }

  return { valid: true };
}

export interface DownloadMediaOptions {
  jobId: string;
  url: string;
  qualityOption?: QualityOption | null;
  outputDir: string;
  tempDir: string;
  onProgress: (progress: Partial<DownloadProgress>) => void;
  onComplete: (outputFile: string) => void;
  onError: (error: string, details?: string) => void;
}

/**
 * Download media using yt-dlp with proper ffmpeg path, progress parsing,
 * and full error reporting.
 */
export async function downloadMedia(opts: DownloadMediaOptions): Promise<void> {
  const ytDlpPath = getYtDlpPath();
  const ffmpegPath = getFfmpegPath();
  const { jobId, url, qualityOption, outputDir, tempDir, onProgress, onComplete, onError } = opts;

  // --- Validate URL ---
  const urlValidation = validateVideoUrl(url);
  if (!urlValidation.valid) {
    onError(urlValidation.error || 'Invalid URL');
    return;
  }

  // --- Validate binaries exist ---
  if (!fs.existsSync(ytDlpPath)) {
    onError('yt-dlp binary not found.', `Expected path: ${ytDlpPath}\nPlease verify resources/bin/yt-dlp.exe exists.`);
    return;
  }

  if (!fs.existsSync(ffmpegPath)) {
    onError(
      'ffmpeg binary not found. It is required to merge video and audio streams.',
      `Expected path: ${ffmpegPath}\nPlease verify resources/bin/ffmpeg.exe exists.`
    );
    return;
  }

  // --- Ensure output and temp directories exist (Requirement 15) ---
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // --- Build output template (Requirement 16) ---
  const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');

  // --- Build format selector (Requirement 2) ---
  // Requested: bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[ext=mp4]
  let formatSelector: string;

  if (qualityOption?.isAudioOnly) {
    if (qualityOption.formatTag === 'mp3') {
      formatSelector = 'bestaudio/best';
    } else if (qualityOption.formatTag === 'm4a') {
      formatSelector = 'ba[ext=m4a]/bestaudio/best';
    } else {
      formatSelector = 'bestaudio/best';
    }
  } else {
    // Determine resolution limit (default to 720p if not specified or 720p chosen)
    const targetHeight = (qualityOption?.height && qualityOption.height > 0) ? qualityOption.height : 720;
    // Exactly matches Requirement 2 for 720p: bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[ext=mp4]
    formatSelector = `bv*[height<=${targetHeight}][ext=mp4]+ba[ext=m4a]/b[ext=mp4]`;
  }

  // --- Build yt-dlp argument array safely as an array (Requirement 3, 4, 7) ---
  const args: string[] = [
    '--no-playlist',                                  // Requirement 3: --no-playlist
    '--newline',                                      // Requirement 3: --newline
    '--force-ipv4',                                   // Requirement 3: --force-ipv4
    '--merge-output-format', 'mp4',                   // Requirement 3: --merge-output-format mp4
    '--ffmpeg-location', ffmpegPath,                  // Requirement 4: configure FFmpeg path
    '--progress',                                     // Emit progress output
    '--windows-filenames',                            // Force safe Windows filenames
    '-f', formatSelector,                            // Requirement 2: format selector
    '-o', outputTemplate,                            // Requirement 16: safe output template
  ];

  // Audio-only: extract and re-encode to MP3 via ffmpeg if MP3 requested
  if (qualityOption?.isAudioOnly && qualityOption.formatTag === 'mp3') {
    args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
  }

  // URL must be the very last argument
  args.push(url);

  console.log('[ytdlp] Starting download execution');
  console.log('[ytdlp] Binary:', ytDlpPath);
  console.log('[ytdlp] FFmpeg:', ffmpegPath);
  console.log('[ytdlp] Format selector:', formatSelector);
  console.log('[ytdlp] Output template:', outputTemplate);

  // Requirement 12: Preparing download
  onProgress({ status: 'downloading', stage: 'Preparing download', percent: 0 });

  return new Promise((resolve) => {
    // Requirement 7 & 8: Use spawn safely with array of arguments
    const proc = spawn(ytDlpPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: tempDir,
    });

    processManager.register(jobId, proc);

    let stderrBuffer = '';

    // Requirement 8: Listen to stdout
    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        parseYtDlpProgress(line.trim(), onProgress);
      }
    });

    // Requirement 8: Listen to stderr
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;
      console.error('[ytdlp stderr]', text.trim());
    });

    // Requirement 8: Listen to error
    proc.on('error', (err) => {
      const msg = `Failed to launch yt-dlp: ${err.message}`;
      console.error('[ytdlp error]', msg);
      // Requirement 12: Download failed
      onProgress({ status: 'failed', stage: 'Download failed', percent: null });
      onError(msg, err.stack);
      resolve();
    });

    // Requirement 8: Listen to close
    proc.on('close', (code) => {
      processManager.unregister(jobId);

      if (code === null) {
        // User cancelled
        resolve();
        return;
      }

      if (code !== 0) {
        const errMsg = parseYtDlpError(stderrBuffer, url);
        console.error(`[ytdlp] Process exited with code ${code}`);
        console.error('[ytdlp] Full stderr:', stderrBuffer);
        // Requirement 12: Download failed
        onProgress({ status: 'failed', stage: 'Download failed', percent: null });
        onError(errMsg, stderrBuffer);
        resolve();
        return;
      }

      // Find output file in temp dir
      const outputFile = findOutputFile(tempDir);
      if (!outputFile) {
        const errMsg = 'Download finished but merged file was not found in temp directory.';
        onProgress({ status: 'failed', stage: 'Download failed', percent: null });
        onError(errMsg, `Temp dir: ${tempDir}\nStderr: ${stderrBuffer}`);
        resolve();
        return;
      }

      console.log('[ytdlp] Download succeeded:', outputFile);
      onComplete(outputFile);
      resolve();
    });
  });
}

/**
 * Parse yt-dlp stdout progress lines.
 *
 * Examples:
 *   [download]  82.3% of   45.23MiB at   1.23MiB/s ETA 00:10
 *   [download]  100% of   45.23MiB in 00:30
 *   [Merger] Merging formats into "file.mp4"
 *   [download] Destination: file.mp4
 */
function parseYtDlpProgress(line: string, onProgress: (p: Partial<DownloadProgress>) => void): void {
  if (!line) return;

  // Full progress line with speed and ETA
  const progressMatch = line.match(
    /\[download\]\s+(\d+\.?\d*)%\s+of\s+([\d.]+\s*\w+)\s+at\s+([\d.]+\s*\w+\/s)\s+ETA\s+(\S+)/
  );
  if (progressMatch) {
    onProgress({
      status: 'downloading',
      stage: 'Downloading',
      percent: parseFloat(progressMatch[1]),
      speed: progressMatch[3],
      eta: progressMatch[4] === 'Unknown' ? null : progressMatch[4],
    });
    return;
  }

  // Progress line without speed (e.g. "100% of X in Y")
  const simpleMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
  if (simpleMatch) {
    const pct = parseFloat(simpleMatch[1]);
    onProgress({
      status: 'downloading',
      stage: 'Downloading',
      percent: pct,
    });
    return;
  }

  // Merger / merge stage (Requirement 12: Merging video and audio)
  if (line.includes('[Merger]') || line.toLowerCase().includes('merging formats')) {
    onProgress({ status: 'merging', stage: 'Merging video and audio', percent: null });
    return;
  }

  // ffmpeg post-processing (Requirement 12: Merging video and audio)
  if (line.includes('[ffmpeg]') || line.includes('[ExtractAudio]') || line.includes('[VideoConvertor]')) {
    onProgress({ status: 'merging', stage: 'Merging video and audio', percent: null });
    return;
  }

  // Destination line (yt-dlp telling us where it's saving)
  const destMatch = line.match(/\[download\] Destination: (.+)/);
  if (destMatch) {
    const fname = path.basename(destMatch[1]);
    onProgress({ stage: 'Downloading', filename: fname });
    return;
  }

  // Already downloaded
  if (line.includes('has already been downloaded')) {
    onProgress({ status: 'downloading', percent: 100, stage: 'Downloading' });
    return;
  }
}

/**
 * Find the primary media output file in a directory.
 * Prefers video containers, then audio-only, ignores fragments.
 */
function findOutputFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter(f => {
    // Ignore yt-dlp partial downloads and temporary fragments
    return !f.endsWith('.part') && !f.endsWith('.ytdl') && !f.endsWith('.temp');
  });

  const videoExts = ['.mp4', '.webm', '.mkv', '.avi', '.mov'];
  const audioExts = ['.mp3', '.m4a', '.ogg', '.opus', '.flac', '.aac', '.wav'];

  for (const ext of videoExts) {
    const found = files.find(f => f.toLowerCase().endsWith(ext));
    if (found) return path.join(dir, found);
  }
  for (const ext of audioExts) {
    const found = files.find(f => f.toLowerCase().endsWith(ext));
    if (found) return path.join(dir, found);
  }

  if (files.length > 0) return path.join(dir, files[0]);
  return null;
}

/**
 * Parse yt-dlp stderr output for a user-friendly error message.
 */
function parseYtDlpError(stderr: string, _url: string): string {
  if (!stderr || !stderr.trim()) return 'Download failed. Check the console for details.';

  if (stderr.includes('is not a valid URL') || stderr.includes('Unsupported URL')) {
    return 'Invalid or unsupported URL. Please check the URL and try again.';
  }
  if (stderr.includes('Video unavailable') || stderr.includes('video is not available')) {
    return 'This video is unavailable. It may have been removed or is private.';
  }
  if (stderr.includes('Private video')) {
    return 'This video is private and cannot be downloaded.';
  }
  if (stderr.includes('Sign in to confirm your age')) {
    return 'Age-restricted content cannot be downloaded without authentication.';
  }
  if (stderr.includes('members-only') || stderr.includes('This video is available to')) {
    return 'This video is members-only content and cannot be downloaded.';
  }
  if (stderr.includes('No video formats found') || stderr.includes('Requested format is not available')) {
    return 'No compatible format found. Try a different quality option.';
  }
  if (stderr.includes('Unable to extract') || stderr.includes('Could not extract')) {
    return 'Could not extract video info. The URL may be unsupported or the video removed.';
  }
  if (stderr.includes('Network') || stderr.includes('Connection') || stderr.includes('timed out')) {
    return 'Network error. Please check your internet connection and try again.';
  }
  if (stderr.includes('HTTP Error 403')) {
    return 'Access denied (HTTP 403). This content may be geo-restricted.';
  }
  if (stderr.includes('HTTP Error 404')) {
    return 'Content not found (HTTP 404). The URL may be incorrect.';
  }
  if (stderr.includes('ffmpeg') && stderr.includes('not found')) {
    return 'ffmpeg not found. Make sure ffmpeg.exe is in resources/bin/.';
  }

  // Extract the first ERROR: line from stderr for generic cases
  const firstError = stderr.split('\n').find(l => l.includes('ERROR:'));
  if (firstError) {
    return firstError.replace(/^.*ERROR:\s*/i, '').trim();
  }

  // Last resort: return first non-empty line of stderr
  const firstLine = stderr.split('\n').find(l => l.trim());
  return firstLine?.trim() || 'Download failed. Please check the URL and try again.';
}
