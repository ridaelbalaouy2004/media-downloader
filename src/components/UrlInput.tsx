import React, { useState, useRef, useMemo } from 'react';
import type { PlatformType } from '../types';

interface UrlInputProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

function detectPlatform(url: string): { type: PlatformType; name: string; color: string; icon: React.ReactNode } {
  const trimmed = url.trim();
  if (!trimmed) {
    return {
      type: 'generic',
      name: 'Media',
      color: 'text-white/40 bg-white/5 border-white/10',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
      ),
    };
  }

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Image
    if (/\.(jpg|jpeg|png|webp|gif|bmp)(\?.*)?$/i.test(path)) {
      return {
        type: 'image',
        name: 'Image',
        color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        ),
      };
    }

    // YouTube
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
      return {
        type: 'youtube',
        name: 'YouTube',
        color: 'text-red-300 bg-red-500/15 border-red-500/30',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        ),
      };
    }

    // Instagram
    if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am') {
      return {
        type: 'instagram',
        name: 'Instagram',
        color: 'text-pink-300 bg-pink-500/15 border-pink-500/30',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
          </svg>
        ),
      };
    }

    // Facebook
    if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch' || host === 'fb.com') {
      return {
        type: 'facebook',
        name: 'Facebook',
        color: 'text-blue-300 bg-blue-500/15 border-blue-500/30',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        ),
      };
    }

    // TikTok
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      return {
        type: 'tiktok',
        name: 'TikTok',
        color: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.27 1.76-.23 1.08.14 2.23.88 3.01.74.79 1.87 1.12 2.93.94 1.05-.18 1.96-.92 2.33-1.92.19-.51.27-1.06.27-1.61V.02h.06z"/>
          </svg>
        ),
      };
    }
  } catch {
    // fallback to generic
  }

  return {
    type: 'generic',
    name: 'Web Media',
    color: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
  };
}

export function UrlInput({ onAnalyze, isLoading, disabled }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const platformInfo = useMemo(() => detectPlatform(url), [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed && !isLoading) {
      onAnalyze(trimmed);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim().startsWith('http')) {
        setUrl(text.trim());
      }
    } catch {
      // Clipboard access may be denied
    }
  };

  const handleClear = () => {
    setUrl('');
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={`
          relative flex items-center gap-2.5 rounded-2xl border transition-all duration-300 p-1.5
          ${isFocused
            ? 'border-brand-500/60 bg-surface-700/90 shadow-lg shadow-brand-500/15'
            : 'border-white/8 bg-surface-700/50 hover:border-white/15 hover:bg-surface-700/70'
          }
        `}
      >
        {/* Dynamic Platform Badge */}
        <div className="pl-2">
          <div
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold transition-all duration-200
              ${platformInfo.color}
            `}
            title={`Detected Platform: ${platformInfo.name}`}
          >
            {platformInfo.icon}
            <span className="hidden sm:inline">{platformInfo.name}</span>
          </div>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Paste URL from YouTube, Instagram, Facebook, TikTok, or Images..."
          disabled={disabled || isLoading}
          className="flex-1 bg-transparent py-2.5 text-white placeholder-white/30 outline-none text-sm font-medium disabled:opacity-50 min-w-0"
          id="url-input"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Clear button */}
        {url && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className="text-white/30 hover:text-white/70 transition-colors duration-150 p-1.5 rounded-lg hover:bg-white/5"
            title="Clear"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}

        {/* Paste button */}
        {!url && (
          <button
            type="button"
            onClick={handlePaste}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/10 transition-all duration-150"
          >
            Paste
          </button>
        )}

        {/* Analyze button */}
        <button
          type="submit"
          disabled={!url.trim() || isLoading || disabled}
          id="analyze-btn"
          className={`
            px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex-shrink-0
            ${url.trim() && !isLoading && !disabled
              ? 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-lg shadow-brand-600/30 hover:shadow-brand-500/40 active:scale-95'
              : 'bg-white/5 text-white/25 cursor-not-allowed'
            }
          `}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Analyzing...</span>
            </div>
          ) : (
            'Analyze'
          )}
        </button>
      </div>
    </form>
  );
}
