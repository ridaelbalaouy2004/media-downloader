import React from 'react';
import type { DownloadProgress, DownloadStatus } from '../types';

interface ProgressBarProps {
  progress: DownloadProgress;
  onCancel?: () => void;
}

const statusColors: Record<DownloadStatus, string> = {
  queued: 'from-white/20 to-white/30',
  analyzing: 'from-blue-500 to-blue-400',
  downloading: 'from-brand-600 to-brand-400',
  merging: 'from-amber-600 to-amber-400',
  finalizing: 'from-green-600 to-green-400',
  completed: 'from-green-600 to-emerald-400',
  cancelled: 'from-white/20 to-white/30',
  failed: 'from-red-600 to-red-400',
  paused: 'from-amber-500 to-yellow-400',
};

const statusLabels: Record<DownloadStatus, string> = {
  queued: 'Waiting in queue',
  analyzing: 'Analyzing',
  downloading: 'Downloading',
  merging: 'Merging video and audio',
  finalizing: 'Finalizing',
  completed: 'Download completed',
  cancelled: 'Cancelled',
  failed: 'Download failed',
  paused: 'Paused',
};

export function ProgressBar({ progress, onCancel }: ProgressBarProps) {
  const { status, percent, stage, speed, eta } = progress;
  const isActive = ['queued', 'analyzing', 'downloading', 'merging', 'finalizing'].includes(status);
  const isIndeterminate = isActive && percent === null;
  const displayPercent = percent !== null ? Math.min(100, Math.max(0, percent)) : null;

  return (
    <div className="space-y-2.5">
      {/* Stage and controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div className={`
            w-2 h-2 rounded-full
            ${status === 'completed' ? 'bg-green-400' : ''}
            ${status === 'failed' ? 'bg-red-400' : ''}
            ${status === 'cancelled' ? 'bg-white/30' : ''}
            ${status === 'paused' ? 'bg-amber-400' : ''}
            ${isActive ? 'bg-brand-400 animate-pulse' : ''}
          `} />

          <span className="text-sm font-medium text-white/80">
            {stage || statusLabels[status]}
          </span>

          {status === 'completed' && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>

        {/* Meta info + cancel */}
        <div className="flex items-center gap-3">
          {speed && isActive && (
            <span className="text-xs text-white/40 font-mono">{speed}</span>
          )}
          {eta && isActive && (
            <span className="text-xs text-white/40">ETA {eta}</span>
          )}
          {displayPercent !== null && isActive && (
            <span className="text-sm font-semibold text-white/70 font-mono tabular-nums">
              {displayPercent.toFixed(0)}%
            </span>
          )}
          {isActive && onCancel && (
            <button
              onClick={onCancel}
              className="text-xs px-2.5 py-1 rounded-lg bg-white/8 hover:bg-red-500/20 text-white/50 hover:text-red-300 border border-white/8 hover:border-red-500/30 transition-all duration-150"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress bar track */}
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        {isIndeterminate ? (
          /* Indeterminate animation */
          <div
            className={`h-full rounded-full bg-gradient-to-r ${statusColors[status]} opacity-80`}
            style={{
              width: '40%',
              animation: 'indeterminate 1.5s ease-in-out infinite',
            }}
          />
        ) : displayPercent !== null ? (
          <div
            className={`h-full rounded-full bg-gradient-to-r ${statusColors[status]} transition-all duration-300 ease-out`}
            style={{ width: `${displayPercent}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}
