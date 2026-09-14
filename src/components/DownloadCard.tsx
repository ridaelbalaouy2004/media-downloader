import React, { useState } from 'react';
import type { DownloadJob } from '../types';
import { ProgressBar } from './ProgressBar';
import { ipc, formatBytes, formatDate } from '../services/ipc';

interface DownloadCardProps {
  job: DownloadJob;
  onCancel: (jobId: string) => void;
  onDismiss?: (jobId: string) => void;
}

export function DownloadCard({ job, onCancel, onDismiss }: DownloadCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isActive = ['queued', 'analyzing', 'downloading', 'merging', 'finalizing'].includes(job.status);

  const handleOpenFile = async () => {
    if (job.outputFile) {
      await ipc.openFile(job.outputFile);
    }
  };

  const handleOpenFolder = async () => {
    const target = job.outputFile || job.outputDir;
    await ipc.showItemInFolder(target);
  };

  return (
    <div
      className={`
        rounded-2xl border overflow-hidden transition-all duration-300 animate-slide-up
        ${job.status === 'completed' ? 'border-green-500/30 bg-green-500/10 shadow-lg shadow-green-500/5' : ''}
        ${job.status === 'failed' ? 'border-red-500/30 bg-red-500/10 shadow-lg shadow-red-500/5' : ''}
        ${job.status === 'cancelled' ? 'border-white/6 bg-white/3 opacity-60' : ''}
        ${isActive ? 'border-brand-500/30 bg-surface-700/80 shadow-lg shadow-brand-500/10' : ''}
      `}
    >
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-20 h-[52px] rounded-lg overflow-hidden bg-surface-600/50">
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
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/90 truncate" title={job.title}>
                {job.title}
              </p>
              <p className="text-xs text-white/40 mt-0.5">
                {job.qualityLabel} • {job.format.toUpperCase()}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
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

              {!isActive && onDismiss && (
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
              onCancel={isActive ? () => onCancel(job.jobId) : undefined}
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
        </div>
      </div>
    </div>
  );
}
