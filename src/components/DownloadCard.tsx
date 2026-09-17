import React, { useState } from 'react';
import type { DownloadJob } from '../types';
import { ProgressBar } from './ProgressBar';
import { ipc, formatBytes, formatDate } from '../services/ipc';

interface DownloadCardProps {
  job: DownloadJob;
  onCancel: (jobId: string) => void;
  onPause?: (jobId: string) => void;
  onResume?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onDismiss?: (jobId: string) => void;
}

export function DownloadCard({ job, onCancel, onPause, onResume, onRetry, onDismiss }: DownloadCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isExecuting = ['analyzing', 'downloading', 'merging', 'finalizing'].includes(job.status);
  const isQueued = job.status === 'queued';
  const isPaused = job.status === 'paused';
  const isActive = isExecuting || isQueued;

  const handleOpenFile = async () => {
    setActionError(null);
    if (job.outputFile) {
      const res = await ipc.openFile(job.outputFile);
      if (!res.success && res.error) {
        setActionError(res.error);
      }
    }
  };

  const handleOpenFolder = async () => {
    setActionError(null);
    const target = job.outputFile || job.outputDir;
    if (target) {
      const res = await ipc.showItemInFolder(target);
      if (!res.success && res.error) {
        setActionError(res.error);
      }
    }
  };

  return (
    <div
      className={`
        rounded-2xl border overflow-hidden transition-all duration-300 animate-slide-up
        ${job.status === 'completed' ? 'border-green-500/30 bg-green-500/10 shadow-lg shadow-green-500/5' : ''}
        ${job.status === 'failed' ? 'border-red-500/30 bg-red-500/10 shadow-lg shadow-red-500/5' : ''}
        ${job.status === 'cancelled' ? 'border-white/6 bg-white/3 opacity-60' : ''}
        ${isPaused ? 'border-amber-500/30 bg-amber-500/10 shadow-lg shadow-amber-500/5' : ''}
        ${isExecuting ? 'border-brand-500/30 bg-surface-700/80 shadow-lg shadow-brand-500/10' : ''}
        ${isQueued ? 'border-white/10 bg-surface-700/50' : ''}
      `}
    >
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div
          onClick={job.status === 'completed' && job.outputFile ? handleOpenFile : undefined}
          className={`flex-shrink-0 w-20 h-[52px] rounded-lg overflow-hidden bg-surface-600/50 relative ${
            job.status === 'completed' && job.outputFile ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
          }`}
          title={job.status === 'completed' && job.outputFile ? 'Click to open file' : undefined}
        >
          {job.thumbnail ? (
            <img
              src={job.thumbnail}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            </div>
          )}
          {isPaused && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-xs font-bold text-amber-300 bg-amber-500/30 px-1.5 py-0.5 rounded">PAUSED</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p
                  onClick={job.status === 'completed' && job.outputFile ? handleOpenFile : undefined}
                  className={`text-sm font-semibold truncate ${
                    job.status === 'completed' && job.outputFile
                      ? 'text-white hover:text-brand-300 cursor-pointer underline-offset-2 hover:underline'
                      : 'text-white/90'
                  }`}
                  title={job.status === 'completed' && job.outputFile ? `Open: ${job.outputFile}` : job.title}
                >
                  {job.title}
                </p>
                {job.playlistTitle && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 whitespace-nowrap">
                    Playlist {job.playlistIndex ? `#${job.playlistIndex}` : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 mt-0.5">
                {job.qualityLabel} • {job.format.toUpperCase()}
                {job.playlistTitle ? ` • ${job.playlistTitle}` : ''}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Pause button (when actively running) */}
              {isExecuting && onPause && (
                <button
                  onClick={() => onPause(job.jobId)}
                  title="Pause download"
                  className="px-2 py-1 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all duration-150 flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1"/>
                    <rect x="14" y="4" width="4" height="16" rx="1"/>
                  </svg>
                  <span>Pause</span>
                </button>
              )}

              {/* Resume button (when paused) */}
              {isPaused && onResume && (
                <button
                  onClick={() => onResume(job.jobId)}
                  title="Resume download"
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-green-300 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 transition-all duration-150 flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  <span>Resume</span>
                </button>
              )}

              {/* Retry button (when failed or cancelled) */}
              {(job.status === 'failed' || job.status === 'cancelled') && onRetry && (
                <button
                  onClick={() => onRetry(job.jobId)}
                  title="Retry download"
                  className="px-2 py-1 rounded-lg text-xs font-medium text-brand-300 bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 transition-all duration-150 flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6"/>
                    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                  </svg>
                  <span>Retry</span>
                </button>
              )}

              {/* Completed file actions */}
              {job.status === 'completed' && job.outputFile && (
                <>
                  <button
                    onClick={handleOpenFile}
                    title="Open file"
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all duration-150"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </button>
                  <button
                    onClick={handleOpenFolder}
                    title="Show in folder"
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all duration-150"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                  </button>
                </>
              )}

              {job.status === 'failed' && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  title="Show error details"
                  className="px-2 py-1 rounded-lg text-xs font-semibold text-red-300 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 transition-all duration-150"
                >
                  {showDetails ? 'Hide Error' : 'Show Error'}
                </button>
              )}

              {/* Cancel button if active or paused */}
              {(isActive || isPaused) && (
                <button
                  onClick={() => onCancel(job.jobId)}
                  title="Cancel download"
                  className="p-1.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/20 transition-all duration-150"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}

              {/* Dismiss button if not running */}
              {!isActive && !isPaused && onDismiss && (
                <button
                  onClick={() => onDismiss(job.jobId)}
                  title="Dismiss"
                  className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/10 transition-all duration-150"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="mt-3">
            <ProgressBar
              progress={job.progress}
            />
          </div>

          {/* Error details (expandable) */}
          {job.status === 'failed' && job.error && (
            <div className="mt-2">
              <p className="text-xs text-red-400/80">{job.error}</p>
              {showDetails && job.errorDetails && (
                <pre className="mt-2 text-xs text-white/30 bg-black/30 rounded-lg p-2 overflow-auto max-h-20 font-mono">
                  {job.errorDetails}
                </pre>
              )}
            </div>
          )}

          {/* Success info */}
          {job.status === 'completed' && job.outputFile && (
            <p className="text-xs text-white/30 mt-1.5 truncate" title={job.outputFile}>
              📁 {job.outputFile}
            </p>
          )}

          {/* Action error (e.g. file or folder moved/deleted) */}
          {actionError && (
            <div className="mt-2 flex items-center justify-between p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200 animate-slide-down">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-red-400 font-bold">⚠</span>
                <span className="truncate">{actionError}</span>
              </div>
              <button
                onClick={() => setActionError(null)}
                className="text-red-400 hover:text-red-200 ml-2 font-bold px-1"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
