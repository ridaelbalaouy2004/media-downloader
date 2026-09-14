import React, { useState, useEffect } from 'react';
import { ipc } from '../services/ipc';

interface TitleBarProps {
  title?: string;
}

export function TitleBar({ title = 'Media Downloader' }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const unsub = ipc.onWindowMaximized((maximized) => {
      setIsMaximized(maximized);
    });
    return unsub;
  }, []);

  return (
    <div
      className="h-10 flex items-center justify-between px-4 select-none bg-surface-800/80 border-b border-white/5 backdrop-blur-sm"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App icon + title */}
      <div className="flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>
        <span className="text-sm font-semibold text-white/90 tracking-tight">{title}</span>
      </div>

      {/* Window controls */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => ipc.minimizeWindow()}
          className="w-8 h-8 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all duration-150"
          title="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button
          onClick={() => ipc.maximizeWindow()}
          className="w-8 h-8 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all duration-150"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="3" width="12" height="12" rx="1"/>
              <path d="M3 9h6v12h12"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="1"/>
            </svg>
          )}
        </button>
        <button
          onClick={() => ipc.closeWindow()}
          className="w-8 h-8 rounded-md flex items-center justify-center text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
