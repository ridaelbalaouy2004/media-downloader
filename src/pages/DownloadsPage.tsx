import React, { useState, useEffect } from 'react';
import type { DownloadHistoryEntry } from '../types';
import { ipc, formatBytes, formatDate } from '../services/ipc';

export function DownloadsPage() {
  const [history, setHistory] = useState<DownloadHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const result = await ipc.getHistory();
      if (result.success && result.data) {
        setHistory(result.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (jobId: string) => {
    setRemoving(jobId);
    await ipc.removeHistoryEntry(jobId);
    setHistory(prev => prev.filter(e => e.jobId !== jobId));
    setRemoving(null);
  };

  const handleClearAll = async () => {
    if (!confirm('Clear all download history? This will not delete the actual files.')) return;
    await ipc.clearHistory();
    setHistory([]);
  };

  const [actionError, setActionError] = useState<string | null>(null);

  const handleOpenFile = async (filePath: string) => {
    setActionError(null);
    const res = await ipc.openFile(filePath);
    if (!res.success && res.error) {
      setActionError(res.error);
    }
  };

  const handleOpenFolder = async (filePath: string) => {
    setActionError(null);
    const res = await ipc.showItemInFolder(filePath);
    if (!res.success && res.error) {
      setActionError(res.error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-white/30">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <span className="text-sm">Loading history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-white/90">Download History</h1>
          <p className="text-sm text-white/40 mt-0.5">{history.length} downloads</p>
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-white/40 hover:text-red-300 hover:bg-red-500/10 border border-white/8 hover:border-red-500/20 transition-all duration-150"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Action error alert */}
      {actionError && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200 flex items-center justify-between animate-slide-down">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-red-400 font-bold">⚠</span>
            <span className="truncate">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200 font-bold ml-2 px-1">
            ✕
          </button>
        </div>
      )}

      {/* History list */}
      {history.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-600/50 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white/40">No downloads yet</p>
            <p className="text-xs text-white/25 mt-1">Your completed downloads will appear here</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 -mr-2 pr-2">
          {history.map((entry) => (
            <HistoryItem
              key={entry.jobId}
              entry={entry}
              removing={removing === entry.jobId}
              onRemove={handleRemove}
              onOpenFile={handleOpenFile}
              onOpenFolder={handleOpenFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface HistoryItemProps {
  entry: DownloadHistoryEntry;
  removing: boolean;
  onRemove: (jobId: string) => void;
  onOpenFile: (filePath: string) => void;
  onOpenFolder: (filePath: string) => void;
}

function HistoryItem({ entry, removing, onRemove, onOpenFile, onOpenFolder }: HistoryItemProps) {
  const [showPath, setShowPath] = useState(false);

  return (
    <div
      className={`
        flex items-center gap-4 p-4 rounded-2xl border border-white/6 bg-surface-700/30
        hover:bg-surface-700/50 hover:border-white/10 transition-all duration-150 group
        ${removing ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      {/* Thumbnail */}
      <div
        onClick={entry.outputFile ? () => onOpenFile(entry.outputFile) : undefined}
        className={`flex-shrink-0 w-16 h-10 rounded-lg overflow-hidden bg-surface-600/50 ${
          entry.outputFile ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
        }`}
        title={entry.outputFile ? 'Click to open file' : undefined}
      >
        {entry.thumbnail ? (
          <img
            src={entry.thumbnail}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          onClick={entry.outputFile ? () => onOpenFile(entry.outputFile) : undefined}
          className={`text-sm font-semibold truncate ${
            entry.outputFile
              ? 'text-white/80 hover:text-brand-300 cursor-pointer underline-offset-2 hover:underline'
              : 'text-white/80'
          }`}
          title={entry.outputFile ? `Open: ${entry.outputFile}` : entry.title}
        >
          {entry.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-white/30">{entry.qualityLabel}</span>
          <span className="text-white/15">•</span>
          <span className="text-xs text-white/30 uppercase font-mono">{entry.format}</span>
          {entry.fileSize && (
            <>
              <span className="text-white/15">•</span>
              <span className="text-xs text-white/30">{formatBytes(entry.fileSize)}</span>
            </>
          )}
          <span className="text-white/15">•</span>
          <span className="text-xs text-white/30">{formatDate(entry.endTime)}</span>
        </div>
      </div>

      {/* Status badge */}
      <div className={`
        px-2 py-0.5 rounded text-xs font-medium flex-shrink-0
        ${entry.status === 'completed' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}
      `}>
        {entry.status}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={() => onOpenFile(entry.outputFile)}
          title="Open file"
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all duration-150"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
        <button
          onClick={() => onOpenFolder(entry.outputFile)}
          title="Show in folder"
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all duration-150"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
        </button>
        <button
          onClick={() => onRemove(entry.jobId)}
          title="Remove from history"
          className="p-1.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-all duration-150"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
