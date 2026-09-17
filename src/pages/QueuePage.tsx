import React, { useState } from 'react';
import type { DownloadJob } from '../types';
import { DownloadCard } from '../components/DownloadCard';
import { useDownloads } from '../hooks/useDownload';

interface QueuePageProps {
  onNavigateHome?: () => void;
}

type QueueFilter = 'all' | 'active' | 'queued' | 'paused' | 'completed' | 'failed';

export function QueuePage({ onNavigateHome }: QueuePageProps) {
  const [filter, setFilter] = useState<QueueFilter>('all');

  const {
    jobs,
    activeJobs,
    queuedJobs,
    pausedJobs,
    completedJobs,
    failedJobs,
    concurrency,
    setConcurrency,
    pauseDownload,
    resumeDownload,
    retryDownload,
    cancelDownload,
    dismissJob,
    pauseAll,
    resumeAll,
    cancelAll,
    clearCompleted,
    clearFailed,
  } = useDownloads();

  const getFilteredJobs = (): DownloadJob[] => {
    switch (filter) {
      case 'active':
        return activeJobs;
      case 'queued':
        return queuedJobs;
      case 'paused':
        return pausedJobs;
      case 'completed':
        return completedJobs;
      case 'failed':
        return failedJobs;
      case 'all':
      default:
        return jobs;
    }
  };

  const filteredJobs = getFilteredJobs();
  const hasRunningJobs = activeJobs.length > 0 || queuedJobs.length > 0;
  const hasPausedJobs = pausedJobs.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden px-6 py-6 space-y-5">
      {/* Header & Concurrency Control */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-white tracking-tight">Download Queue</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-semibold border border-brand-500/30">
              {jobs.length} {jobs.length === 1 ? 'task' : 'tasks'}
            </span>
          </div>
          <p className="text-xs text-white/40 mt-0.5">
            Manage active, scheduled, paused, and finished downloads
          </p>
        </div>

        {/* Concurrency Selector */}
        <div className="flex items-center gap-2 bg-surface-700/80 px-3 py-1.5 rounded-xl border border-white/8">
          <span className="text-xs text-white/60 font-medium">Simultaneous:</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3].map((num) => (
              <button
                key={num}
                onClick={() => setConcurrency(num)}
                title={`Allow up to ${num} simultaneous download${num > 1 ? 's' : ''}`}
                className={`
                  w-7 h-7 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center
                  ${concurrency === num
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30 scale-105'
                    : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                  }
                `}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Stats Overview Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div
          onClick={() => setFilter('active')}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            filter === 'active'
              ? 'bg-brand-500/20 border-brand-500/40 shadow-lg shadow-brand-500/10'
              : 'bg-surface-700/40 border-white/6 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Active</span>
            <div className={`w-2 h-2 rounded-full ${activeJobs.length > 0 ? 'bg-brand-400 animate-pulse' : 'bg-white/20'}`} />
          </div>
          <p className="text-xl font-black text-white mt-1">{activeJobs.length}</p>
        </div>

        <div
          onClick={() => setFilter('queued')}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            filter === 'queued'
              ? 'bg-blue-500/20 border-blue-500/40 shadow-lg shadow-blue-500/10'
              : 'bg-surface-700/40 border-white/6 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Waiting</span>
            <span className="text-[10px] text-white/40">Queue</span>
          </div>
          <p className="text-xl font-black text-white mt-1">{queuedJobs.length}</p>
        </div>

        <div
          onClick={() => setFilter('paused')}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            filter === 'paused'
              ? 'bg-amber-500/20 border-amber-500/40 shadow-lg shadow-amber-500/10'
              : 'bg-surface-700/40 border-white/6 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Paused</span>
            <div className={`w-2 h-2 rounded-full ${pausedJobs.length > 0 ? 'bg-amber-400' : 'bg-white/20'}`} />
          </div>
          <p className="text-xl font-black text-amber-300 mt-1">{pausedJobs.length}</p>
        </div>

        <div
          onClick={() => setFilter('completed')}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            filter === 'completed'
              ? 'bg-green-500/20 border-green-500/40 shadow-lg shadow-green-500/10'
              : 'bg-surface-700/40 border-white/6 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Completed</span>
            <div className={`w-2 h-2 rounded-full ${completedJobs.length > 0 ? 'bg-green-400' : 'bg-white/20'}`} />
          </div>
          <p className="text-xl font-black text-green-400 mt-1">{completedJobs.length}</p>
        </div>

        <div
          onClick={() => setFilter('failed')}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            filter === 'failed'
              ? 'bg-red-500/20 border-red-500/40 shadow-lg shadow-red-500/10'
              : 'bg-surface-700/40 border-white/6 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium">Failed</span>
            <div className={`w-2 h-2 rounded-full ${failedJobs.length > 0 ? 'bg-red-400' : 'bg-white/20'}`} />
          </div>
          <p className="text-xl font-black text-red-400 mt-1">{failedJobs.length}</p>
        </div>
      </div>

      {/* Global Bulk Actions Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-700/50 border border-white/8">
        {/* Filter pills */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {(['all', 'active', 'queued', 'paused', 'completed', 'failed'] as QueueFilter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-150 whitespace-nowrap
                ${filter === tab
                  ? 'bg-white/15 text-white font-semibold shadow-sm'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                }
              `}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Bulk Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {hasRunningJobs && (
            <button
              onClick={pauseAll}
              title="Pause all running and queued downloads"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all duration-150 flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
              <span>Pause All</span>
            </button>
          )}

          {hasPausedJobs && (
            <button
              onClick={resumeAll}
              title="Resume all paused downloads"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-300 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 transition-all duration-150 flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <span>Resume All</span>
            </button>
          )}

          {hasRunningJobs && (
            <button
              onClick={() => {
                if (confirm('Cancel all ongoing and waiting downloads?')) {
                  cancelAll();
                }
              }}
              title="Cancel all running and waiting downloads"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all duration-150 flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              <span>Cancel All</span>
            </button>
          )}

          {completedJobs.length > 0 && (
            <button
              onClick={clearCompleted}
              title="Clear completed tasks from queue"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/8 transition-all duration-150"
            >
              Clear Completed
            </button>
          )}

          {failedJobs.length > 0 && (
            <button
              onClick={clearFailed}
              title="Clear failed and cancelled tasks"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/8 transition-all duration-150"
            >
              Clear Failed
            </button>
          )}
        </div>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto space-y-3 -mr-2 pr-2">
        {filteredJobs.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-surface-700/50 flex items-center justify-center text-white/20">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white/50">
                {filter === 'all' ? 'No downloads in the queue' : `No ${filter} downloads`}
              </p>
              <p className="text-xs text-white/30 mt-1">
                Paste any video or audio link on the Home page to start downloading
              </p>
            </div>
            {onNavigateHome && (
              <button
                onClick={onNavigateHome}
                className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/20 transition-all duration-150"
              >
                Add Download
              </button>
            )}
          </div>
        ) : (
          filteredJobs.map((job) => (
            <DownloadCard
              key={job.jobId}
              job={job}
              onCancel={cancelDownload}
              onPause={pauseDownload}
              onResume={resumeDownload}
              onRetry={retryDownload}
              onDismiss={dismissJob}
            />
          ))
        )}
      </div>
    </div>
  );
}
