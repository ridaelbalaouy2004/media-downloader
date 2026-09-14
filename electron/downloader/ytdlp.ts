import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { getYtDlpPath, getFfmpegPath } from '../utils/paths';
import { parseFormat, buildQualityOptions, buildYtDlpFormatSelector } from './formats';
import { processManager } from './processManager';
import type { MediaInfo, DownloadProgress, QualityOption, PlatformType } from '../types';

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
 * Detect platform from a URL.
 */
export function detectPlatform(url: string): PlatformType {
  if (!url) return 'generic';
  try {
    const parsed = new URL(url.trim());
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Check direct image extensions
    if (/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i.test(pathname)) {
      return 'image';
    }

    // YouTube
    if (
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtu.be'
    ) {
      return 'youtube';
    }

    // Instagram
    if (
      hostname === 'instagram.com' ||
      hostname.endsWith('.instagram.com') ||
      hostname === 'instagr.am'
    ) {
      return 'instagram';
    }

    // Facebook
    if (
      hostname === 'facebook.com' ||
      hostname.endsWith('.facebook.com') ||
      hostname === 'fb.watch' ||
      hostname === 'fb.com'
    ) {
      return 'facebook';
    }

    // TikTok
    if (
      hostname === 'tiktok.com' ||
      hostname.endsWith('.tiktok.com')
    ) {
      return 'tiktok';
    }

    return 'generic';
  } catch {
    return 'generic';
  }
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
 * Validate media URL format and supported platforms.
 */
export function validateVideoUrl(url: string): { valid: boolean; platform: PlatformType; error?: string } {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, platform: 'generic', error: 'Please enter a URL.' };
  }

  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      platform: 'generic',
      error: 'Invalid URL format. Please enter a valid link starting with http:// or https://',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, platform: 'generic', error: 'Only HTTP and HTTPS URLs are supported.' };
  }

  const platform = detectPlatform(trimmed);
  const hostname = parsed.hostname.toLowerCase();

  // YouTube specific validation
  if (platform === 'youtube') {
    if (hostname === 'youtu.be' && parsed.pathname.length <= 1) {
      return { valid: false, platform, error: 'Invalid YouTube short URL: missing video ID.' };
    }
    if (parsed.pathname === '/watch' && !parsed.searchParams.get('v')) {
      return { valid: false, platform, error: 'Invalid YouTube URL: missing "?v=" video ID parameter.' };
    }
  }

  // Instagram specific validation
  if (platform === 'instagram') {
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return { valid: false, platform, error: 'Please enter a specific Instagram post, reel, or video URL.' };
    }
  }

  // TikTok specific validation
  if (platform === 'tiktok') {
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return { valid: false, platform, error: 'Please enter a specific TikTok video URL.' };
    }
  }

  // Facebook specific validation
  if (platform === 'facebook') {
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return { valid: false, platform, error: 'Please enter a specific Facebook video or reel URL.' };
    }
  }

  return { valid: true, platform };
}

/**
 * Check if a URL points directly to an image file.
 */
function isDirectImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return /\.(jpg|jpeg|png|webp|gif|bmp)(\?.*)?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Analyze a URL using yt-dlp --dump-json or direct image handling.
 * Returns parsed MediaInfo or throws a friendly, descriptive error.
 */
export async function analyzeUrl(url: string): Promise<MediaInfo> {
  const trimmed = url.trim();
  const validation = validateVideoUrl(trimmed);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid media URL.');
  }

  const platform = validation.platform;

  // 1. Direct Image URL optimization
  if (isDirectImageUrl(trimmed)) {
    const filename = path.basename(new URL(trimmed).pathname);
    const title = filename.split('?')[0] || 'Image Download';
    const qualityOptions = buildQualityOptions([], true);

    return {
      url: trimmed,
      title: title.replace(/[-_]/g, ' '),
      thumbnail: trimmed,
      duration: 0,
      durationStr: 'Image',
      uploader: new URL(trimmed).hostname,
      uploadDate: new Date().toISOString().split('T')[0],
      viewCount: null,
      formats: [],
      qualityOptions,
      webpageUrl: trimmed,
      platform: 'image',
    };
  }

  // 2. yt-dlp supported extraction (YouTube, Instagram, Facebook, TikTok, etc.)
  const ytDlpPath = getYtDlpPath();
  if (!fs.existsSync(ytDlpPath)) {
    throw new Error(`yt-dlp engine not found at: ${ytDlpPath}\nPlease verify resources/bin/yt-dlp.exe is present.`);
  }

  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      // Multi-client strategy to prevent YouTube 403 / throttling
      '--extractor-args', 'youtube:player_client=default,web,android',
      trimmed,
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
      reject(new Error(`Failed to launch download engine: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        const friendlyError = parseYtDlpError(stderr, trimmed);
        reject(new Error(friendlyError));
        return;
      }

      try {
        const firstLine = stdout.trim().split('\n')[0];
        const json = JSON.parse(firstLine);

        const rawFormats = (Array.isArray(json.formats) ? json.formats : []) as Record<string, unknown>[];
        const formats = rawFormats
          .map(parseFormat)
          .filter((f): f is NonNullable<ReturnType<typeof parseFormat>> => f !== null);

        // Check if media is an image post
        const isPostImage = (
          json._type === 'image' ||
          (formats.length > 0 && formats.every(f => !f.hasVideo && !f.hasAudio && ['jpg', 'jpeg', 'png', 'webp'].includes(f.ext))) ||
          (formats.length === 0 && Boolean(json.thumbnail))
        );

        const qualityOptions = buildQualityOptions(formats, isPostImage);

        const info: MediaInfo = {
          url: trimmed,
          title: json.title || 'Media Download',
          thumbnail: json.thumbnail || json.thumbnails?.[json.thumbnails.length - 1]?.url || '',
          duration: json.duration || 0,
          durationStr: json.duration ? formatDuration(json.duration) : (isPostImage ? 'Image' : '0:00'),
          uploader: json.uploader || json.channel || json.creator || platform.toUpperCase(),
          uploadDate: json.upload_date || '',
          viewCount: json.view_count ?? null,
          formats,
          qualityOptions,
          webpageUrl: json.webpage_url || trimmed,
          platform: isPostImage ? 'image' : platform,
        };

        resolve(info);
      } catch (err) {
        reject(new Error(`Failed to parse media details: ${String(err)}`));
      }
    });
  });
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
 * Download direct image file.
 */
async function downloadDirectImage(
  imageUrl: string,
  targetExt: string,
  tempDir: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(imageUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const tempFile = path.join(tempDir, `image_${Date.now()}.${targetExt || 'jpg'}`);
    const fileStream = fs.createWriteStream(tempFile);

    const req = client.get(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      // Handle HTTP redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadDirectImage(res.headers.location, targetExt, tempDir).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download image (HTTP ${res.statusCode})`));
        return;
      }

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve(tempFile));
      });
    });

    req.on('error', (err) => {
      fs.unlink(tempFile, () => {});
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Image download timed out.'));
    });
  });
}

/**
 * Download media using yt-dlp and FFmpeg with multi-platform support.
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

  // --- Ensure directories exist ---
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // --- Special Case: Direct Image Download ---
  if (isDirectImageUrl(url) || qualityOption?.mediaType === 'image') {
    onProgress({ status: 'downloading', stage: 'Downloading image...', percent: 25 });
    try {
      const ext = qualityOption?.formatTag || 'jpg';
      const downloadedImage = await downloadDirectImage(url, ext, tempDir);
      onProgress({ status: 'finalizing', stage: 'Image downloaded', percent: 100 });
      onComplete(downloadedImage);
      return;
    } catch {
      // If direct image fetch fails, fall through to yt-dlp below
    }
  }

  // --- Validate binaries exist ---
  if (!fs.existsSync(ytDlpPath)) {
    onError('yt-dlp binary not found.', `Expected path: ${ytDlpPath}\nPlease verify resources/bin/yt-dlp.exe exists.`);
    return;
  }

  if (!fs.existsSync(ffmpegPath)) {
    onError(
      'FFmpeg binary not found. It is required to process and merge media.',
      `Expected path: ${ffmpegPath}\nPlease verify resources/bin/ffmpeg.exe exists.`
    );
    return;
  }

  // Output template
  const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');

  // Build format selector
  const formatSelector = qualityOption
    ? buildYtDlpFormatSelector(qualityOption)
    : 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bestvideo+bestaudio/best';

  // Build arguments safely
  const args: string[] = [
    '--no-playlist',
    '--newline',
    '--force-ipv4',
    '--ffmpeg-location', ffmpegPath,
    '--progress',
    '--windows-filenames',
    '--extractor-args', 'youtube:player_client=default,web,android',
    '-o', outputTemplate,
  ];

  // Audio-only downloading
  if (qualityOption?.isAudioOnly) {
    args.push('-f', 'bestaudio/best');
    args.push('--extract-audio');
    if (qualityOption.formatTag === 'mp3') {
      args.push('--audio-format', 'mp3', '--audio-quality', '0');
    } else if (qualityOption.formatTag === 'm4a') {
      args.push('--audio-format', 'm4a');
    } else {
      args.push('--audio-format', 'mp3', '--audio-quality', '0');
    }
  } else if (qualityOption?.mediaType === 'image') {
    args.push('--write-thumbnail', '--skip-download');
  } else {
    // Video: Ensure MP4 merge output format
    args.push('--merge-output-format', 'mp4');
    args.push('-f', formatSelector);
  }

  // URL must be the very last argument
  args.push(url);

  console.log('[ytdlp] Starting execution for job:', jobId);
  console.log('[ytdlp] Format selector:', formatSelector);

  onProgress({ status: 'downloading', stage: 'Preparing download...', percent: 0 });

  return new Promise((resolve) => {
    const proc = spawn(ytDlpPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: tempDir,
    });

    processManager.register(jobId, proc);

    let stderrBuffer = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        parseYtDlpProgress(line.trim(), onProgress);
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;
    });

    proc.on('error', (err) => {
      const msg = `Failed to launch download engine: ${err.message}`;
      onProgress({ status: 'failed', stage: 'Download failed', percent: null });
      onError(msg, err.stack);
      resolve();
    });

    proc.on('close', (code) => {
      processManager.unregister(jobId);

      if (code === null) {
        // User cancelled
        resolve();
        return;
      }

      if (code !== 0) {
        const errMsg = parseYtDlpError(stderrBuffer, url);
        onProgress({ status: 'failed', stage: 'Download failed', percent: null });
        onError(errMsg, stderrBuffer);
        resolve();
        return;
      }

      // Find output file in temp dir
      const outputFile = findOutputFile(tempDir);
      if (!outputFile) {
        const errMsg = 'Download finished but output file was not found in temporary directory.';
        onProgress({ status: 'failed', stage: 'Download failed', percent: null });
        onError(errMsg, `Temp dir: ${tempDir}\nStderr: ${stderrBuffer}`);
        resolve();
        return;
      }

      onComplete(outputFile);
      resolve();
    });
  });
}

/**
 * Parse yt-dlp stdout progress lines.
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
      stage: 'Downloading...',
      percent: parseFloat(progressMatch[1]),
      speed: progressMatch[3],
      eta: progressMatch[4] === 'Unknown' ? null : progressMatch[4],
    });
    return;
  }

  // Simple progress percentage line
  const simpleMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
  if (simpleMatch) {
    const pct = parseFloat(simpleMatch[1]);
    onProgress({
      status: 'downloading',
      stage: 'Downloading...',
      percent: pct,
    });
    return;
  }

  // Merger / merge stage
  if (line.includes('[Merger]') || line.toLowerCase().includes('merging formats')) {
    onProgress({ status: 'merging', stage: 'Merging video & audio with FFmpeg...', percent: null });
    return;
  }

  // Audio extraction / conversion
  if (line.includes('[ExtractAudio]') || line.includes('[ffmpeg] Destination:') || line.includes('Post-process file')) {
    onProgress({ status: 'merging', stage: 'Converting audio with FFmpeg...', percent: null });
    return;
  }

  // Destination line
  const destMatch = line.match(/\[download\] Destination: (.+)/);
  if (destMatch) {
    const fname = path.basename(destMatch[1]);
    onProgress({ stage: 'Downloading...', filename: fname });
    return;
  }

  // Already downloaded
  if (line.includes('has already been downloaded')) {
    onProgress({ status: 'downloading', percent: 100, stage: 'Finalizing...' });
    return;
  }
}

/**
 * Find the primary media output file in a directory.
 */
function findOutputFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }

  const files = entries.filter(f => {
    const full = path.join(dir, f);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size === 0) return false;
    } catch {
      return false;
    }
    return !f.endsWith('.part') && !f.endsWith('.ytdl') && !f.endsWith('.temp');
  });

  const preferredExts = [
    '.mp4', '.mp3', '.m4a', '.webm', '.mkv',
    '.jpg', '.jpeg', '.png', '.webp', '.gif',
  ];

  for (const ext of preferredExts) {
    const found = files.find(f => f.toLowerCase().endsWith(ext));
    if (found) return path.join(dir, found);
  }

  if (files.length > 0) return path.join(dir, files[0]);
  return null;
}

/**
 * Parse yt-dlp stderr output into user-friendly error messages.
 */
export function parseYtDlpError(stderr: string, url: string): string {
  if (!stderr || !stderr.trim()) {
    return 'Download could not be completed. Please verify the URL and try again.';
  }

  const platform = detectPlatform(url);
  const platformName = platform === 'youtube'
    ? 'YouTube'
    : platform === 'instagram'
    ? 'Instagram'
    : platform === 'facebook'
    ? 'Facebook'
    : platform === 'tiktok'
    ? 'TikTok'
    : 'Platform';

  // HTTP 403 Forbidden
  if (stderr.includes('HTTP Error 403') || stderr.includes('403: Forbidden')) {
    return `Access denied by ${platformName} (HTTP 403). The video may be restricted, private, or blocked in this region.`;
  }

  // Private / Login Required
  if (
    stderr.includes('Private video') ||
    stderr.includes('Login required') ||
    stderr.includes('This video is private') ||
    stderr.includes('Sign in to confirm') ||
    stderr.includes('requires login')
  ) {
    return `This content is private or requires an account login on ${platformName}. Only publicly accessible media can be downloaded.`;
  }

  // Video unavailable / removed
  if (
    stderr.includes('Video unavailable') ||
    stderr.includes('video is not available') ||
    stderr.includes('Post not found') ||
    stderr.includes('This post has been removed')
  ) {
    return `This ${platformName} post or video is unavailable. It may have been deleted by the author.`;
  }

  // Age restriction
  if (stderr.includes('confirm your age') || stderr.includes('age-restricted')) {
    return `This ${platformName} video is age-restricted and cannot be downloaded without account verification.`;
  }

  // Members only
  if (stderr.includes('members-only') || stderr.includes('available to this channel\'s members')) {
    return 'This video is members-only content and cannot be downloaded.';
  }

  // Format not available
  if (stderr.includes('Requested format is not available') || stderr.includes('No video formats found')) {
    return 'The requested format or quality is not available for this media. Please select another quality.';
  }

  // Network / Timeout
  if (
    stderr.includes('timed out') ||
    stderr.includes('Connection reset') ||
    stderr.includes('getaddrinfo ENOTFOUND') ||
    stderr.includes('Network is unreachable')
  ) {
    return 'Network connection error or timeout. Please check your internet connection and try again.';
  }

  // Unsupported URL
  if (stderr.includes('is not a valid URL') || stderr.includes('Unsupported URL')) {
    return 'The provided URL is not supported or does not contain downloadable media.';
  }

  // FFmpeg missing
  if (stderr.includes('ffmpeg') && stderr.includes('not found')) {
    return 'FFmpeg was not found. Please ensure ffmpeg.exe is in the resources/bin/ directory.';
  }

  // Extract first clean ERROR line if available
  const errorMatch = stderr.split('\n').find(line => line.includes('ERROR:'));
  if (errorMatch) {
    const clean = errorMatch.replace(/^.*?ERROR:\s*/i, '').trim();
    if (clean) return clean;
  }

  return 'Download failed. The media may be unavailable or protected by the platform.';
}
