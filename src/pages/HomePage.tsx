import React, { useState, useCallback, useEffect } from 'react';
import type { MediaInfo, QualityOption, DiagnosticsResult, AppSettings, PlaylistInfo } from '../types';
import { UrlInput } from '../components/UrlInput';
import { QualitySelector } from '../components/QualitySelector';
import { DownloadCard } from '../components/DownloadCard';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel';
import { DeveloperSection } from '../components/DeveloperSection';
import { ipc } from '../services/ipc';
import { useDownloads } from '../hooks/useDownload';

interface HomePageProps {
  settings: AppSettings;
  onNavigateQueue?: () => void;
}

type AnalysisState = 'idle' | 'loading' | 'success' | 'error';

export function HomePage({ settings, onNavigateQueue }: HomePageProps) {
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<QualityOption | null>(null);
  const [outputDir, setOutputDir] = useState(settings.defaultDownloadDir || '');
  const [isStarting, setIsStarting] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [detectedPlaylist, setDetectedPlaylist] = useState<PlaylistInfo | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [showDiag, setShowDiag] = useState(false);

  const {
    jobs,
    activeJobs,
    queuedJobs,
    pauseDownload,
    resumeDownload,
    retryDownload,
    cancelDownload,
    dismissJob,
  } = useDownloads();

  // Update output dir when settings change
  useEffect(() => {
    if (settings.defaultDownloadDir && !outputDir) {
      setOutputDir(settings.defaultDownloadDir);
    }
  }, [settings.defaultDownloadDir]);

  // Load diagnostics on mount
  useEffect(() => {
    loadDiagnostics();
  }, []);

  const loadDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const result = await ipc.runDiagnostics();
      if (result.success && result.data) {
        setDiagnostics(result.data);
        if (!result.data.ytDlpFound || !result.data.ffmpegFound) {
          setShowDiag(true);
        }
      }
    } finally {
      setDiagLoading(false);
    }
  };

  const validateUrl = (urlToValidate: string): { valid: boolean; error?: string } => {
    if (!urlToValidate || !urlToValidate.trim()) {
      return { valid: false, error: 'Please enter a media URL.' };
    }
    try {
      const parsed = new URL(urlToValidate.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, error: 'Only HTTP and HTTPS URLs are supported.' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format. Please enter a valid URL.' };
    }
  };

  const handleAnalyze = useCallback(async (url: string) => {
    const check = validateUrl(url);
    if (!check.valid) {
      setAnalysisState('error');
      setAnalysisError(check.error || 'Invalid URL');
      return;
    }

    setAnalysisState('loading');
    setAnalysisError(null);
    setDownloadError(null);
    setSuccessMessage(null);
    setMediaInfo(null);
    setSelectedQuality(null);
    setDetectedPlaylist(null);
    setShowPlaylistModal(false);

    try {
      // Check if URL has a playlist parameter or is a playlist URL
      const isPossiblePlaylist = url.includes('list=') || url.includes('/playlist');

      // Start fetching video info and (if applicable) playlist info in parallel
      const analyzePromise = ipc.analyzeUrl(url);
      const playlistPromise = isPossiblePlaylist ? ipc.getPlaylistInfo(url) : Promise.resolve(null);

      const [result, playlistResult] = await Promise.all([analyzePromise, playlistPromise]);

      if (playlistResult && playlistResult.success && playlistResult.data && playlistResult.data.entries.length > 1) {
        setDetectedPlaylist(playlistResult.data);
      }

      if (result.success && result.data) {
        setMediaInfo(result.data);
        setAnalysisState('success');

        // Auto-select Best Available Quality or preferred format
        const options = result.data.qualityOptions;
        if (options.length > 0) {
          const preferred =
            options.find(o => o.id === 'best-video-mp4') ||
            options.find(o => o.height === 720 && o.formatTag === 'mp4') ||
            options.find(o => o.height >= 720 && o.formatTag === 'mp4') ||
            options.find(o => !o.isAudioOnly) ||
            options[0];
          setSelectedQuality(preferred || null);
        }
      } else {
        setAnalysisState('error');
        setAnalysisError(result.error || 'Analysis failed. Please check the URL.');
      }
    } catch (err) {
      setAnalysisState('error');
      setAnalysisError(String(err));
    }
  }, []);

  const handleChooseFolder = async () => {
    const result = await ipc.chooseFolder();
    if (!result.cancelled && result.path) {
      setOutputDir(result.path);
    }
  };

  const enqueueSingleDownload = async () => {
    if (!mediaInfo || !selectedQuality || !outputDir) return;

    setDownloadError(null);
    setIsStarting(true);

    try {
      const result = await ipc.startDownload({
        url: mediaInfo.url,
        qualityOption: selectedQuality,
        outputDir,
        title: mediaInfo.title,
        thumbnail: mediaInfo.thumbnail,
      });

      if (!result.success) {
        setDownloadError(result.error || 'Failed to queue download.');
      } else if (result.jobId) {
        setCurrentJobId(result.jobId);
        setSuccessMessage(`Added "${mediaInfo.title}" to download queue!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
    } finally {
      setIsStarting(false);
      setShowPlaylistModal(false);
    }
  };

  const enqueuePlaylistDownload = async () => {
    if (!mediaInfo || !selectedQuality || !outputDir || !detectedPlaylist) return;

    setDownloadError(null);
    setIsStarting(true);

    try {
      const result = await ipc.startPlaylistDownload({
        playlist: detectedPlaylist,
        qualityOption: selectedQuality,
        outputDir,
      });

      if (!result.success) {
        setDownloadError(result.error || 'Failed to queue playlist.');
      } else {
        const count = result.jobIds?.length ?? detectedPlaylist.entries.length;
        setSuccessMessage(`Added ${count} playlist items to download queue!`);
        setShowPlaylistModal(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
    } finally {
      setIsStarting(false);
    }
  };

  const handleDownloadClick = () => {
    if (detectedPlaylist && detectedPlaylist.entries.length > 1) {
      setShowPlaylistModal(true);
    } else {
      enqueueSingleDownload();
    }
  };

  // Non-blocking: Can download whenever valid info & quality exist
  const canDownload = Boolean(
    mediaInfo &&
    selectedQuality &&
    outputDir &&
    (diagnostics?.ytDlpFound ?? true) &&
    !isStarting
  );

  // Recent jobs to display
  const displayJobs = jobs.slice(0, 5);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Hero header */}
        <div className="text-center space-y-2 py-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            Permanent Global Multi-Download Queue
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Media Downloader
          </h1>
          <p className="text-white/40 text-sm max-w-md mx-auto">
            Download videos, playlists, and audio from YouTube, TikTok, Facebook, Instagram and more with non-blocking multi-queueing.
          </p>
          <div className="pt-2 flex justify-center">
            <DeveloperSection variant="hero" />
          </div>
        </div>

        {/* URL input */}
        <UrlInput
          onAnalyze={handleAnalyze}
          isLoading={analysisState === 'loading'}
        />

        {/* Success toast / notification with Quick Link to Queue */}
        {successMessage && (
          <div className="flex items-center justify-between p-4 rounded-2xl bg-brand-500/15 border border-brand-500/30 animate-slide-down">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-brand-400 flex-shrink-0 animate-pulse" />
              <p className="text-sm font-semibold text-brand-200 truncate">{successMessage}</p>
            </div>
            {onNavigateQueue && (
              <button
                onClick={onNavigateQueue}
                className="text-xs px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold transition-all shadow-md shadow-brand-500/20 flex-shrink-0 ml-3"
              >
                View Queue ({activeJobs.length + queuedJobs.length}) →
              </button>
            )}
          </div>
        )}

        {/* Analysis Error state */}
        {analysisState === 'error' && analysisError && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 animate-slide-down">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-red-300">Analysis Failed</p>
              <p className="text-sm text-red-300/70 mt-0.5">{analysisError}</p>
            </div>
          </div>
        )}

        {/* Real yt-dlp download failure alert */}
        {downloadError && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 animate-slide-down">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-red-300">Download Failed</p>
                <button
                  onClick={() => setDownloadError(null)}
                  className="text-xs text-red-400/60 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-red-200/90 mt-1 font-mono break-words">{downloadError}</p>
            </div>
          </div>
        )}

        {/* Media card - shown after successful analysis */}
        {mediaInfo && analysisState === 'success' && (
          <div className="space-y-4 animate-slide-up">
            {/* Media info card */}
            <div className="rounded-2xl border border-white/8 bg-surface-700/40 overflow-hidden">
              <div className="flex gap-5 p-5">
                {/* Thumbnail */}
                {mediaInfo.thumbnail && (
                  <div className="flex-shrink-0 w-36 h-20 rounded-xl overflow-hidden bg-surface-600/50 shadow-lg">
                    <img
                      src={mediaInfo.thumbnail}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {mediaInfo.platform && (
                      <span className="inline-flex items-center gap-1 uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-white/70 border border-white/10">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                        {mediaInfo.platform}
                      </span>
                    )}
                    {detectedPlaylist && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-500/20 text-brand-300 border border-brand-500/30">
                        📋 Playlist ({detectedPlaylist.entryCount} items)
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-white/95 leading-tight line-clamp-2">
                    {mediaInfo.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <div className="flex items-center gap-1.5 text-xs text-white/50">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      {mediaInfo.uploader}
                    </div>
                    {mediaInfo.durationStr && (
                      <div className="flex items-center gap-1.5 text-xs text-white/50">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {mediaInfo.durationStr}
                      </div>
                    )}
                    {mediaInfo.viewCount !== null && (
                      <div className="flex items-center gap-1.5 text-xs text-white/50">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        {mediaInfo.viewCount.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-white/5" />

              {/* Quality selection */}
              <div className="p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white/80 mb-3">Select Quality</h3>
                  {mediaInfo.qualityOptions.length > 0 ? (
                    <QualitySelector
                      options={mediaInfo.qualityOptions}
                      selected={selectedQuality}
                      onSelect={setSelectedQuality}
                    />
                  ) : (
                    <p className="text-sm text-white/40">No downloadable formats found.</p>
                  )}
                </div>

                {/* Output folder */}
                <div>
                  <h3 className="text-sm font-bold text-white/80 mb-2">Save Location</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface-600/50 border border-white/8 min-w-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 flex-shrink-0">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                      </svg>
                      <span className="text-sm text-white/60 truncate font-mono text-xs">
                        {outputDir || 'No folder selected'}
                      </span>
                    </div>
                    <button
                      onClick={handleChooseFolder}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-600 hover:bg-surface-500 border border-white/10 hover:border-white/20 text-white/70 hover:text-white transition-all duration-150 whitespace-nowrap"
                    >
                      Choose Folder
                    </button>
                  </div>
                </div>

                {/* Non-blocking Download button */}
                <button
                  onClick={handleDownloadClick}
                  disabled={!canDownload}
                  id="download-btn"
                  className={`
                    w-full py-4 rounded-2xl text-base font-bold transition-all duration-200 flex items-center justify-center gap-3
                    ${canDownload
                      ? 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-xl shadow-brand-600/25 hover:shadow-brand-500/30 active:scale-[0.99]'
                      : 'bg-white/5 text-white/25 cursor-not-allowed'
                    }
                  `}
                >
                  {isStarting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  )}
                  {isStarting
                    ? 'Adding to Queue...'
                    : detectedPlaylist
                      ? `Download (${detectedPlaylist.entryCount} Playlist Videos Available)`
                      : 'Add to Download Queue'}
                </button>

                {!diagnostics?.ytDlpFound && (
                  <p className="text-xs text-amber-400/70 text-center">
                    ⚠ yt-dlp not found — downloads will not work.{' '}
                    <button onClick={() => setShowDiag(true)} className="underline">View diagnostics</button>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Playlist Selection Modal Dialog */}
        {showPlaylistModal && detectedPlaylist && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-surface-800 border border-white/15 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center text-brand-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/>
                    <line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Playlist Detected</h3>
                  <p className="text-xs text-white/50">{detectedPlaylist.entryCount} videos found</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-700/50 border border-white/5">
                <p className="text-sm font-semibold text-white/90 truncate">{detectedPlaylist.title}</p>
                <p className="text-xs text-white/40 mt-1">
                  How would you like to download this URL?
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={enqueuePlaylistDownload}
                  disabled={isStarting}
                  className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/>
                    <line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                  </svg>
                  <span>Download Entire Playlist ({detectedPlaylist.entryCount} items)</span>
                </button>

                <button
                  onClick={enqueueSingleDownload}
                  disabled={isStarting}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white/80 transition-all"
                >
                  Download Single Video Only
                </button>

                <button
                  onClick={() => setShowPlaylistModal(false)}
                  className="w-full py-2 px-4 rounded-xl text-xs text-white/40 hover:text-white/70 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Download Queue preview & recent downloads */}
        {displayJobs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeJobs.length > 0 ? 'bg-brand-400 animate-pulse' : 'bg-white/40'}`} />
                <h2 className="text-sm font-bold text-white/70">
                  {activeJobs.length > 0 ? 'Live Downloads & Queue' : 'Recent Downloads'}
                </h2>
                <span className="text-xs text-white/30 bg-white/8 rounded-full px-2 py-0.5">{jobs.length}</span>
              </div>
              {onNavigateQueue && (
                <button
                  onClick={onNavigateQueue}
                  className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
                >
                  <span>View All in Queue ({jobs.length})</span>
                  <span>→</span>
                </button>
              )}
            </div>
            <div className="space-y-3">
              {displayJobs.map(job => (
                <DownloadCard
                  key={job.jobId}
                  job={job}
                  onCancel={cancelDownload}
                  onPause={pauseDownload}
                  onResume={resumeDownload}
                  onRetry={retryDownload}
                  onDismiss={dismissJob}
                />
              ))}
            </div>
          </div>
        )}

        {/* Developer About & Social Card */}
        <DeveloperSection variant="footer" className="mt-8" />

        {/* Diagnostics panel (toggle) */}
        <div>
          <button
            onClick={() => setShowDiag(!showDiag)}
            className="flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors duration-150"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform duration-200 ${showDiag ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            System Diagnostics
            {diagnostics && (!diagnostics.ytDlpFound || !diagnostics.ffmpegFound) && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs">!</span>
            )}
          </button>

          {showDiag && (
            <div className="mt-3">
              <DiagnosticsPanel
                diagnostics={diagnostics}
                loading={diagLoading}
                onRefresh={loadDiagnostics}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
