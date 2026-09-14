import type { MediaFormat, QualityOption } from '../types';

/**
 * Parse yt-dlp format objects into our normalized MediaFormat structure.
 */
export function parseFormat(raw: Record<string, unknown>): MediaFormat | null {
  const formatId = String(raw.format_id || '');
  const ext = String(raw.ext || '');
  const vcodec = String(raw.vcodec || 'none');
  const acodec = String(raw.acodec || 'none');
  const height = Number(raw.height) || 0;
  const width = Number(raw.width) || 0;
  const fps = raw.fps ? Number(raw.fps) : null;
  const filesize = raw.filesize ? Number(raw.filesize) : null;
  const filesizeApprox = raw.filesize_approx ? Number(raw.filesize_approx) : null;
  const tbr = raw.tbr ? Number(raw.tbr) : null;
  const quality = Number(raw.quality) || 0;

  const hasVideo = vcodec !== 'none' && vcodec !== '' && height > 0;
  const hasAudio = acodec !== 'none' && acodec !== '';

  if (!formatId) return null;

  // Build human-readable resolution label
  let resolution = 'audio only';
  if (hasVideo) {
    if (height > 0) {
      resolution = `${height}p`;
      if (width > 0) resolution = `${width}x${height}`;
    }
  }

  const label = buildFormatLabel(hasVideo, hasAudio, height, ext, fps);

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
  height: number,
  ext: string,
  fps: number | null
): string {
  if (!hasVideo && hasAudio) return `Audio only — ${ext.toUpperCase()}`;

  const res = height > 0 ? `${height}p` : 'Unknown';
  const fpsTag = fps && fps > 30 ? ` ${Math.round(fps)}fps` : '';
  const av = hasAudio ? 'Video+Audio' : 'Video only';

  return `${res}${fpsTag} — ${ext.toUpperCase()} — ${av}`;
}

/**
 * Build quality options from a list of parsed formats.
 * Groups formats into human-readable quality tiers.
 */
export function buildQualityOptions(formats: MediaFormat[]): QualityOption[] {
  const options: QualityOption[] = [];

  // Separate video-only, audio-only, and combined formats
  const videoFormats = formats.filter(f => f.hasVideo);
  const audioFormats = formats.filter(f => !f.hasVideo && f.hasAudio);
  const combinedFormats = formats.filter(f => f.hasVideo && f.hasAudio);

  // Get unique heights
  const heights = [...new Set(videoFormats.map(f => getHeight(f)))]
    .filter(h => h > 0)
    .sort((a, b) => b - a);

  // For each height, create options for supported containers
  for (const height of heights) {
    // Check MP4 option
    const mp4Option = buildVideoOption(height, 'mp4', videoFormats, audioFormats, combinedFormats);
    if (mp4Option) options.push(mp4Option);

    // Check WebM option
    const webmOption = buildVideoOption(height, 'webm', videoFormats, audioFormats, combinedFormats);
    if (webmOption) options.push(webmOption);
  }

  // Audio-only options
  if (audioFormats.length > 0) {
    const bestAudio = selectBestAudioFormat(audioFormats, null);

    options.push({
      id: 'audio-mp3',
      label: 'Audio Only — MP3',
      height: 0,
      formatTag: 'mp3',
      videoFormatId: null,
      audioFormatId: bestAudio?.formatId || null,
      needsMerge: false,
      estimatedSize: bestAudio?.filesize || null,
      isAudioOnly: true,
    });

    options.push({
      id: 'audio-m4a',
      label: 'Audio Only — M4A',
      height: 0,
      formatTag: 'm4a',
      videoFormatId: null,
      audioFormatId: bestAudio?.formatId || null,
      needsMerge: false,
      estimatedSize: bestAudio?.filesize || null,
      isAudioOnly: true,
    });
  }

  return options;
}

function buildVideoOption(
  height: number,
  container: 'mp4' | 'webm',
  videoFormats: MediaFormat[],
  audioFormats: MediaFormat[],
  combinedFormats: MediaFormat[]
): QualityOption | null {
  // 1. Try to find a combined format at this height for this container
  const combinedAtHeight = combinedFormats
    .filter(f => getHeight(f) === height && isCompatibleContainer(f, container))
    .sort((a, b) => (b.filesize || 0) - (a.filesize || 0));

  if (combinedAtHeight.length > 0) {
    const fmt = combinedAtHeight[0];
    return {
      id: `${height}p-${container}-combined`,
      label: buildQualityLabel(height, container, false, fmt.fps),
      height,
      formatTag: container,
      videoFormatId: fmt.formatId,
      audioFormatId: null,
      needsMerge: false,
      estimatedSize: fmt.filesize,
      isAudioOnly: false,
    };
  }

  // 2. Try video-only + best audio merge
  const videoAtHeight = videoFormats
    .filter(f => getHeight(f) === height && isCompatibleContainer(f, container) && !f.hasAudio)
    .sort((a, b) => (b.filesize || b.tbr || 0) - (a.filesize || a.tbr || 0));

  if (videoAtHeight.length > 0) {
    const videoFmt = videoAtHeight[0];
    const audioFmt = selectBestAudioFormat(audioFormats, container);

    if (!audioFmt) {
      // No audio available, skip this option
      return null;
    }

    const estimatedSize = (videoFmt.filesize || 0) + (audioFmt.filesize || 0);

    return {
      id: `${height}p-${container}-merged`,
      label: buildQualityLabel(height, container, true, videoFmt.fps),
      height,
      formatTag: container,
      videoFormatId: videoFmt.formatId,
      audioFormatId: audioFmt.formatId,
      needsMerge: true,
      estimatedSize: estimatedSize > 0 ? estimatedSize : null,
      isAudioOnly: false,
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
  const mergeNote = needsMerge ? ' ✦ merged' : ' ✦ combined';

  return `${resLabel}${fpsTag} — ${ext}${mergeNote}`;
}

function getResolutionLabel(height: number): string {
  if (height >= 2160) return '4K (2160p)';
  if (height >= 1440) return '2K (1440p)';
  if (height >= 1080) return '1080p Full HD';
  if (height >= 720) return '720p HD';
  if (height >= 480) return '480p';
  if (height >= 360) return '360p';
  if (height >= 240) return '240p';
  if (height >= 144) return '144p';
  return `${height}p`;
}

function getHeight(f: MediaFormat): number {
  const match = f.resolution.match(/x(\d+)$/) || f.resolution.match(/^(\d+)p/);
  if (match) return parseInt(match[1]);
  return 0;
}

function isCompatibleContainer(f: MediaFormat, container: 'mp4' | 'webm'): boolean {
  if (container === 'mp4') {
    return ['mp4', 'm4v', 'mov'].includes(f.ext) ||
      f.vcodec.includes('avc') ||
      f.vcodec.includes('h264') ||
      f.vcodec.includes('hevc') ||
      f.vcodec.includes('h265');
  }
  if (container === 'webm') {
    return f.ext === 'webm' ||
      f.vcodec.includes('vp8') ||
      f.vcodec.includes('vp9') ||
      f.vcodec.includes('av01');
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
 * Build the yt-dlp format string for a quality option.
 * Returns the format selector string to pass to yt-dlp -f
 */
export function buildYtDlpFormatSelector(option: QualityOption): string {
  if (option.isAudioOnly) {
    // Audio only: get best audio
    return 'bestaudio';
  }

  if (!option.needsMerge && option.videoFormatId) {
    // Combined format — download directly
    return option.videoFormatId;
  }

  if (option.videoFormatId && option.audioFormatId) {
    // Video + audio separate — yt-dlp will try to merge, but we handle merge in FFmpeg
    return `${option.videoFormatId}+${option.audioFormatId}`;
  }

  // Fallback: ask yt-dlp for best video+audio up to the target height
  if (option.height > 0) {
    return `bestvideo[height<=${option.height}]+bestaudio/best[height<=${option.height}]`;
  }

  return 'bestvideo+bestaudio/best';
}
