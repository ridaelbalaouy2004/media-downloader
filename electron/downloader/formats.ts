import type { MediaFormat, QualityOption } from '../types';

/**
 * Standard supported resolution heights (in descending order).
 */
export const STANDARD_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240, 144];

/**
 * Parse yt-dlp format objects into our normalized MediaFormat structure.
 */
export function parseFormat(raw: Record<string, unknown>): MediaFormat | null {
  const formatId = String(raw.format_id || '');
  const ext = String(raw.ext || '').toLowerCase();
  const vcodec = String(raw.vcodec || 'none');
  const acodec = String(raw.acodec || 'none');
  const height = Number(raw.height) || 0;
  const width = Number(raw.width) || 0;
  const fps = raw.fps ? Number(raw.fps) : null;
  const filesize = raw.filesize ? Number(raw.filesize) : null;
  const filesizeApprox = raw.filesize_approx ? Number(raw.filesize_approx) : null;
  const tbr = raw.tbr ? Number(raw.tbr) : null;
  const quality = Number(raw.quality) || 0;

  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) || vcodec === 'image';
  const hasVideo = !isImage && vcodec !== 'none' && vcodec !== '' && height > 0;
  const hasAudio = acodec !== 'none' && acodec !== '';

  if (!formatId) return null;

  // Build human-readable resolution label
  let resolution = 'audio only';
  if (isImage) {
    resolution = width > 0 && height > 0 ? `${width}x${height}` : 'Image';
  } else if (hasVideo) {
    if (height > 0) {
      resolution = `${height}p`;
      if (width > 0) resolution = `${width}x${height}`;
    }
  }

  const label = buildFormatLabel(hasVideo, hasAudio, isImage, height, ext, fps);

  return {
    formatId,
    ext,
    resolution,
    fps,
    vcodec,
    acodec,
    filesize: filesize || filesizeApprox,
    tbr,
    quality,
    hasVideo,
    hasAudio,
    label,
  };
}

function buildFormatLabel(
  hasVideo: boolean,
  hasAudio: boolean,
  isImage: boolean,
  height: number,
  ext: string,
  fps: number | null
): string {
  if (isImage) return `Image — ${ext.toUpperCase()}`;
  if (!hasVideo && hasAudio) return `Audio only — ${ext.toUpperCase()}`;

  const res = height > 0 ? `${height}p` : 'Unknown';
  const fpsTag = fps && fps > 30 ? ` ${Math.round(fps)}fps` : '';
  const av = hasAudio ? 'Video+Audio' : 'Video only';

  return `${res}${fpsTag} — ${ext.toUpperCase()} — ${av}`;
}

/**
 * Build quality options from a list of parsed formats.
 * Groups formats into human-readable quality tiers:
 * - Best Available Quality — MP4 (Auto)
 * - Individual resolutions (2160p down to 144p)
 * - Audio-only (MP3, M4A)
 * - Images (when available)
 */
export function buildQualityOptions(formats: MediaFormat[], isDirectImage = false): QualityOption[] {
  const options: QualityOption[] = [];

  // Handle direct image media
  if (isDirectImage) {
    options.push(
      {
        id: 'image-jpg',
        label: 'Image — JPG (Best Quality)',
        height: 0,
        formatTag: 'jpg',
        videoFormatId: null,
        audioFormatId: null,
        needsMerge: false,
        estimatedSize: null,
        isAudioOnly: false,
        mediaType: 'image',
      },
      {
        id: 'image-png',
        label: 'Image — PNG (Lossless)',
        height: 0,
        formatTag: 'png',
        videoFormatId: null,
        audioFormatId: null,
        needsMerge: false,
        estimatedSize: null,
        isAudioOnly: false,
        mediaType: 'image',
      },
      {
        id: 'image-webp',
        label: 'Image — WebP',
        height: 0,
        formatTag: 'webp',
        videoFormatId: null,
        audioFormatId: null,
        needsMerge: false,
        estimatedSize: null,
        isAudioOnly: false,
        mediaType: 'image',
      }
    );
    return options;
  }

  // Separate video-only, audio-only, and combined formats
  const videoFormats = formats.filter(f => f.hasVideo);
  const audioFormats = formats.filter(f => !f.hasVideo && f.hasAudio);
  const combinedFormats = formats.filter(f => f.hasVideo && f.hasAudio);
  const hasAnyAudio = audioFormats.length > 0 || combinedFormats.length > 0;

  // Find all available heights normalized to standard tiers
  const rawHeights = [...new Set(videoFormats.map(f => getEffectiveHeight(f)))].filter(h => h > 0);
  const maxHeight = rawHeights.length > 0 ? Math.max(...rawHeights) : 0;

  // 1. Best Available Quality (Top Option for 1-click highest quality)
  if (videoFormats.length > 0 || combinedFormats.length > 0) {
    options.push({
      id: 'best-video-mp4',
      label: `Best Available Quality — MP4 (${getResolutionLabel(maxHeight)})`,
      height: maxHeight,
      formatTag: 'mp4',
      videoFormatId: null,
      audioFormatId: null,
      needsMerge: false,
      estimatedSize: null,
      isAudioOnly: false,
      mediaType: 'video',
    });
  }

  // 2. Map standard heights (2160p down to 144p)
  for (const stdHeight of STANDARD_HEIGHTS) {
    // Only include this standard height if the media actually provides video at or near this tier
    const matchingRawHeight = rawHeights.find(h => isCloseHeight(h, stdHeight));
    if (!matchingRawHeight) continue;

    const mp4Option = buildVideoOption(matchingRawHeight, stdHeight, 'mp4', videoFormats, audioFormats, combinedFormats);
    if (mp4Option && !options.some(o => o.id === mp4Option.id)) {
      options.push(mp4Option);
    }
  }

  // Fallback: If no standard heights matched but video exists, add the raw heights
  if (options.length <= 1 && videoFormats.length > 0) {
    for (const h of rawHeights.sort((a, b) => b - a)) {
      const opt = buildVideoOption(h, h, 'mp4', videoFormats, audioFormats, combinedFormats);
      if (opt && !options.some(o => o.id === opt.id)) {
        options.push(opt);
      }
    }
  }

  // 3. Audio-only options (Always provide MP3 and M4A when audio is present)
  if (hasAnyAudio) {
    const bestAudio = selectBestAudioFormat(audioFormats, null);

    options.push({
      id: 'audio-mp3',
      label: 'Audio Only — MP3 (High Quality)',
      height: 0,
      formatTag: 'mp3',
      videoFormatId: null,
      audioFormatId: bestAudio?.formatId || null,
      needsMerge: false,
      estimatedSize: bestAudio?.filesize || null,
      isAudioOnly: true,
      mediaType: 'audio',
    });

    options.push({
      id: 'audio-m4a',
      label: 'Audio Only — M4A (AAC Audio)',
      height: 0,
      formatTag: 'm4a',
      videoFormatId: null,
      audioFormatId: bestAudio?.formatId || null,
      needsMerge: false,
      estimatedSize: bestAudio?.filesize || null,
      isAudioOnly: true,
      mediaType: 'audio',
    });
  }

  return options;
}

function isCloseHeight(rawHeight: number, stdHeight: number): boolean {
  // Exact match
  if (rawHeight === stdHeight) return true;
  // Account for slight aspect ratio variations (e.g. 1088 vs 1080, 718 vs 720, 484 vs 480)
  return Math.abs(rawHeight - stdHeight) <= 12;
}

function buildVideoOption(
  rawHeight: number,
  stdHeight: number,
  container: 'mp4' | 'webm',
  videoFormats: MediaFormat[],
  audioFormats: MediaFormat[],
  combinedFormats: MediaFormat[]
): QualityOption | null {
  // 1. Try to find a combined format at this height
  const combinedAtHeight = combinedFormats
    .filter(f => getEffectiveHeight(f) === rawHeight && isCompatibleContainer(f, container))
    .sort((a, b) => (b.filesize || 0) - (a.filesize || 0));

  if (combinedAtHeight.length > 0) {
    const fmt = combinedAtHeight[0];
    return {
      id: `${stdHeight}p-${container}`,
      label: buildQualityLabel(stdHeight, container, false, fmt.fps),
      height: stdHeight,
      formatTag: container,
      videoFormatId: fmt.formatId,
      audioFormatId: null,
      needsMerge: false,
      estimatedSize: fmt.filesize,
      isAudioOnly: false,
      mediaType: 'video',
    };
  }

  // 2. Try video-only + best audio merge
  const videoAtHeight = videoFormats
    .filter(f => getEffectiveHeight(f) === rawHeight && isCompatibleContainer(f, container) && !f.hasAudio)
    .sort((a, b) => (b.filesize || b.tbr || 0) - (a.filesize || a.tbr || 0));

  if (videoAtHeight.length > 0) {
    const videoFmt = videoAtHeight[0];
    const audioFmt = selectBestAudioFormat(audioFormats, container);
    const estimatedSize = (videoFmt.filesize || 0) + (audioFmt?.filesize || 0);

    return {
      id: `${stdHeight}p-${container}`,
      label: buildQualityLabel(stdHeight, container, Boolean(audioFmt), videoFmt.fps),
      height: stdHeight,
      formatTag: container,
      videoFormatId: videoFmt.formatId,
      audioFormatId: audioFmt?.formatId || null,
      needsMerge: Boolean(audioFmt),
      estimatedSize: estimatedSize > 0 ? estimatedSize : null,
      isAudioOnly: false,
      mediaType: 'video',
    };
  }

  // 3. Fallback to any video format at this height
  const anyVideoAtHeight = videoFormats
    .filter(f => getEffectiveHeight(f) === rawHeight)
    .sort((a, b) => (b.filesize || b.tbr || 0) - (a.filesize || a.tbr || 0));

  if (anyVideoAtHeight.length > 0) {
    const videoFmt = anyVideoAtHeight[0];
    return {
      id: `${stdHeight}p-${container}`,
      label: buildQualityLabel(stdHeight, container, false, videoFmt.fps),
      height: stdHeight,
      formatTag: container,
      videoFormatId: videoFmt.formatId,
      audioFormatId: null,
      needsMerge: false,
      estimatedSize: videoFmt.filesize,
      isAudioOnly: false,
      mediaType: 'video',
    };
  }

  return null;
}

function buildQualityLabel(
  height: number,
  container: string,
  needsMerge: boolean,
  fps: number | null
): string {
  const resLabel = getResolutionLabel(height);
  const fpsTag = fps && fps > 30 ? ` ${Math.round(fps)}fps` : '';
  const ext = container.toUpperCase();
  const mergeNote = needsMerge ? ' ✦ merged' : '';

  return `${resLabel}${fpsTag} — ${ext}${mergeNote}`;
}

export function getResolutionLabel(height: number): string {
  if (height >= 2160) return '4K (2160p)';
  if (height >= 1440) return '2K (1440p)';
  if (height >= 1080) return '1080p Full HD';
  if (height >= 720) return '720p HD';
  if (height >= 480) return '480p';
  if (height >= 360) return '360p';
  if (height >= 240) return '240p';
  if (height >= 144) return '144p';
  if (height > 0) return `${height}p`;
  return 'Best Quality';
}

function getEffectiveHeight(f: MediaFormat): number {
  // Support both horizontal (1920x1080) and vertical (1080x1920) formats
  const dimMatch = f.resolution.match(/(\d+)x(\d+)/);
  if (dimMatch) {
    const w = parseInt(dimMatch[1], 10);
    const h = parseInt(dimMatch[2], 10);
    // For vertical videos (w < h), the standard quality tier corresponds to w (e.g., 1080x1920 is 1080p vertical)
    if (w > 0 && h > 0 && w < h) {
      return w;
    }
    return h;
  }

  const pMatch = f.resolution.match(/^(\d+)p/);
  if (pMatch) return parseInt(pMatch[1], 10);

  return 0;
}

function isCompatibleContainer(f: MediaFormat, container: 'mp4' | 'webm'): boolean {
  if (container === 'mp4') {
    return (
      ['mp4', 'm4v', 'mov'].includes(f.ext) ||
      f.vcodec.includes('avc') ||
      f.vcodec.includes('h264') ||
      f.vcodec.includes('hevc') ||
      f.vcodec.includes('h265') ||
      f.vcodec.includes('mp4v')
    );
  }
  if (container === 'webm') {
    return (
      f.ext === 'webm' ||
      f.vcodec.includes('vp8') ||
      f.vcodec.includes('vp9') ||
      f.vcodec.includes('av01')
    );
  }
  return false;
}

function selectBestAudioFormat(
  audioFormats: MediaFormat[],
  container: 'mp4' | 'webm' | null
): MediaFormat | null {
  if (audioFormats.length === 0) return null;

  let candidates = audioFormats;

  // For MP4, prefer m4a/aac codecs; for webm, prefer opus/vorbis
  if (container === 'mp4') {
    const preferred = audioFormats.filter(
      f => f.ext === 'm4a' || f.acodec.includes('aac') || f.acodec.includes('mp4a')
    );
    if (preferred.length > 0) candidates = preferred;
  } else if (container === 'webm') {
    const preferred = audioFormats.filter(
      f => f.ext === 'webm' || f.acodec.includes('opus') || f.acodec.includes('vorbis')
    );
    if (preferred.length > 0) candidates = preferred;
  }

  // Sort by bitrate / filesize descending
  candidates.sort((a, b) => (b.tbr || 0) - (a.tbr || 0));
  return candidates[0] || null;
}

/**
 * Build the yt-dlp format selector string to pass to yt-dlp -f
 */
export function buildYtDlpFormatSelector(option: QualityOption): string {
  // Audio only
  if (option.isAudioOnly) {
    return 'bestaudio/best';
  }

  // Image
  if (option.mediaType === 'image') {
    return 'best';
  }

  // Best Available Quality (Auto)
  if (option.id === 'best-video-mp4') {
    return 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bestvideo+bestaudio/best';
  }

  // Specific height
  const height = option.height > 0 ? option.height : 720;
  return `bv*[height<=${height}][ext=mp4]+ba[ext=m4a]/b[height<=${height}][ext=mp4]/bv*[height<=${height}]+ba/b[height<=${height}]/best[height<=${height}]/best`;
}
