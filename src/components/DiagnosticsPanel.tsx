import React from 'react';
import type { DiagnosticsResult } from '../types';

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticsResult | null;
  loading: boolean;
  onRefresh: () => void;
}

interface CheckItemProps {
  label: string;
  found: boolean;
  version?: string | null;
  path: string;
}

function CheckItem({ label, found, version, path }: CheckItemProps) {
  return (
    <div className={`
      flex items-center gap-3 p-3.5 rounded-xl border transition-colors duration-200
      ${found
        ? 'bg-green-500/8 border-green-500/20'
        : 'bg-red-500/8 border-red-500/20'
      }
    `}>
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
        ${found ? 'bg-green-500/20' : 'bg-red-500/20'}
      `}>
        {found ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${found ? 'text-green-300' : 'text-red-300'}`}>
            {label}
          </span>
          {version && (
            <span className="text-xs text-white/40 font-mono">v{version}</span>
          )}
        </div>
        <p className="text-xs text-white/30 truncate mt-0.5 font-mono">{path}</p>
      </div>
    </div>
  );
}

export function DiagnosticsPanel({ diagnostics, loading, onRefresh }: DiagnosticsPanelProps) {
  const allOk = diagnostics &&
    diagnostics.ytDlpFound &&
    diagnostics.ffmpegFound &&
    diagnostics.ffprobeFound;

  return (
    <div className="rounded-2xl border border-white/8 bg-surface-700/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white/90">System Diagnostics</h3>
          <p className="text-xs text-white/40 mt-0.5">Required binaries and permissions</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all duration-150 disabled:opacity-50"
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={loading ? 'animate-spin' : ''}
          >
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/40 text-sm py-4 justify-center">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <span>Checking...</span>
        </div>
      ) : diagnostics ? (
        <div className="space-y-2">
          <CheckItem
            label="yt-dlp"
            found={diagnostics.ytDlpFound}
            version={diagnostics.ytDlpVersion || undefined}
            path={diagnostics.ytDlpPath}
          />
          <CheckItem
            label="FFmpeg"
            found={diagnostics.ffmpegFound}
            version={diagnostics.ffmpegVersion || undefined}
            path={diagnostics.ffmpegPath}
          />
          <CheckItem
            label="ffprobe"
            found={diagnostics.ffprobeFound}
            path={diagnostics.ffprobePath}
          />

          {/* Storage check */}
          <div className={`
            flex items-center gap-3 p-3.5 rounded-xl border
            ${diagnostics.storageWritable ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20'}
          `}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${diagnostics.storageWritable ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              {diagnostics.storageWritable ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              )}
            </div>
            <span className={`text-sm font-semibold ${diagnostics.storageWritable ? 'text-green-300' : 'text-red-300'}`}>
              Storage writable
            </span>
          </div>

          {/* Warning if missing binaries */}
          {!allOk && (
            <div className="mt-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <p className="text-sm font-semibold text-amber-300 mb-1">Missing dependencies</p>
              <p className="text-xs text-amber-300/70 leading-relaxed">
                Place the following files in the <code className="font-mono bg-black/20 px-1 rounded">resources/bin/</code> directory:
              </p>
              <ul className="mt-2 space-y-0.5">
                {!diagnostics.ytDlpFound && (
                  <li className="text-xs text-amber-300/60 font-mono">• yt-dlp.exe</li>
                )}
                {!diagnostics.ffmpegFound && (
                  <li className="text-xs text-amber-300/60 font-mono">• ffmpeg.exe</li>
                )}
                {!diagnostics.ffprobeFound && (
                  <li className="text-xs text-amber-300/60 font-mono">• ffprobe.exe</li>
                )}
              </ul>
              <div className="mt-3 space-y-1">
                <p className="text-xs text-amber-300/50">
                  Download yt-dlp: <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); }}
                    className="text-amber-300 underline"
                  >
                    github.com/yt-dlp/yt-dlp/releases
                  </a>
                </p>
                <p className="text-xs text-amber-300/50">
                  Download FFmpeg: <span className="text-amber-300">ffmpeg.org/download.html</span>
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/30 text-center py-4">Click refresh to run diagnostics</p>
      )}
    </div>
  );
}
