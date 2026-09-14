import React, { useState, useRef, useEffect } from 'react';

interface UrlInputProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function UrlInput({ onAnalyze, isLoading, disabled }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
          relative flex items-center gap-3 rounded-2xl border transition-all duration-300
          ${isFocused
            ? 'border-brand-500/60 bg-surface-700/80 shadow-lg shadow-brand-500/10'
            : 'border-white/8 bg-surface-700/40 hover:border-white/15 hover:bg-surface-700/60'
          }
        `}
      >
        {/* URL Icon */}
        <div className="pl-4 text-white/30">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
          </svg>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Paste a video URL here (YouTube, Vimeo, and more)..."
          disabled={disabled || isLoading}
          className="flex-1 bg-transparent py-4 text-white placeholder-white/25 outline-none text-sm font-medium disabled:opacity-50"
          id="url-input"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Clear button */}
        {url && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className="text-white/30 hover:text-white/70 transition-colors duration-150 p-1"
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
            className="mr-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white/40 hover:text-white/70 hover:bg-white/8 transition-all duration-150"
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
            mr-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${url.trim() && !isLoading && !disabled
              ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/25 hover:shadow-brand-500/30 active:scale-95'
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
