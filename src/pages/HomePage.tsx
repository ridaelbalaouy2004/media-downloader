import React, { useState, useCallback, useEffect } from 'react';
import type { MediaInfo, QualityOption, DiagnosticsResult, AppSettings } from '../types';
import { UrlInput } from '../components/UrlInput';
import { QualitySelector } from '../components/QualitySelector';
import { DownloadCard } from '../components/DownloadCard';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel';
import { DeveloperSection } from '../components/DeveloperSection';
import { ipc, formatBytes } from '../services/ipc';
import { useDownloads } from '../hooks/useDownload';

interface HomePageProps {
  settings: AppSettings;
}

type AnalysisState = 'idle' | 'loading' | 'success' | 'error';

export function HomePage({ settings }: HomePageProps) {
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<QualityOption | null>(null);
  const [outputDir, setOutputDir] = useState(settings.defaultDownloadDir || '');
  const [isStarting, setIsStarting] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [showDiag, setShowDiag] = useState(false);

  const { jobs, activeJobs, completedJobs, cancelDownload, dismissJob } = useDownloads();

  // Find the active/current download job
  const currentJob = jobs.find(j => j.jobId === currentJobId);
  const isJobRunning = currentJob && ['queued', 'analyzing', 'downloading', 'merging', 'finalizing'].includes(currentJob.status);

  // Requirement 11: Disable button while downloading, enable after success or failure
  const isDownloading = isStarting || Boolean(isJobRunning);

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
        // Show diagnostics panel if something is missing
        if (!result.data.ytDlpFound || !result.data.ffmpegFound) {
          setShowDiag(true);
        }
      }
    } finally {
      setDiagLoading(false);
    }
  };

  // Requirement 13: Validate YouTube / video URL before starting
  const validateUrl = (urlToValidate: string): { valid: boolean; error?: string } => {
    if (!urlToValidate || !urlToValidate.trim()) {
      return { valid: false, error: 'Please enter a video URL.' };
    }
    try {
      const parsed = new URL(urlToValidate.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, error: 'Only HTTP and HTTPS URLs are supported.' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format. Please enter a valid URL (e.g. https://youtu.be/... or https://www.youtube.com/watch?v=...).' };
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
    setMediaInfo(null);
    setSelectedQuality(null);

    try {
      const result = await ipc.analyzeUrl(url);
      if (result.success && result.data) {
        setMediaInfo(result.data);
        setAnalysisState('success');

        // Auto-select preferred 720p MP4 or best quality
        const options = result.data.qualityOptions;
        if (options.length > 0) {
          const preferred =
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

  const handleDownload = async () => {
    if (!mediaInfo || !selectedQuality || !outputDir) return;

    // Requirement 13: Validate URL
    const check = validateUrl(mediaInfo.url);
    if (!check.valid) {
      setDownloadError(check.error || 'Invalid video URL');
      return;
    }

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

      // Requirement 10: Show real error inside the UI if failed to start
      if (!result.success) {
        setDownloadError(result.error || 'Failed to start download.');
      } else if (result.jobId) {
        setCurrentJobId(result.jobId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
    } finally {
      setIsStarting(false);
    }
  };

  // Requirement 11: Disable button while downloading
  const canDownload = mediaInfo && selectedQuality && outputDir &&
    (diagnostics?.ytDlpFound ?? true) && !isDownloading;

  // Compute button label based on exact stages (Requirement 12)
  const getButtonText = () => {
    if (isStarting) return 'Preparing download...';
    if (currentJob?.status === 'downloading') {
      const pct = currentJob.progress.percent !== null ? ` ${currentJob.progress.percent.toFixed(0)}%` : '';
      return `Downloading${pct}...`;
    }
    if (currentJob?.status === 'merging') return 'Merging video and audio...';
    if (currentJob?.status === 'queued') return 'Preparing download...';
    return 'Download';
  };

  // Recent jobs to display (active first, followed by recent completed/failed)
  const displayJobs = jobs.slice(0, 5);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Hero header */}
        <div className="text-center space-y-2 py-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            Powered by yt-dlp + FFmpeg
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Media Downloader
          </h1>
          <p className="text-white/40 text-sm max-w-md mx-auto">
            Download videos and audio from YouTube and thousands of supported sites.
            All processing happens locally on your PC.
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

        {/* Requirement 10: Real yt-dlp download failure alert */}
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
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
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

                {/* Requirement 11: Download button disabled while downloading */}
                <button
                  onClick={handleDownload}
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
                  {isDownloading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  )}
                  {getButtonText()}
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

        {/* Requirements 9, 10, 12: Download progress & recent downloads */}
        {displayJobs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isJobRunning ? 'bg-brand-400 animate-pulse' : 'bg-white/40'}`} />
                <h2 className="text-sm font-bold text-white/70">
                  {isJobRunning ? 'Current Download' : 'Recent Downloads'}
                </h2>
                <span className="text-xs text-white/30 bg-white/8 rounded-full px-2 py-0.5">{displayJobs.length}</span>
              </div>
            </div>
            <div className="space-y-3">
              {displayJobs.map(job => (
                <DownloadCard
                  key={job.jobId}
                  job={job}
                  onCancel={cancelDownload}
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
