import React from 'react';
import type { QualityOption } from '../types';

interface QualitySelectorProps {
  options: QualityOption[];
  selected: QualityOption | null;
  onSelect: (option: QualityOption) => void;
}

function getOptionBadge(option: QualityOption): { text: string; color: string } {
  if (option.mediaType === 'image') {
    return { text: option.formatTag.toUpperCase(), color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' };
  }
  if (option.isAudioOnly) {
    return { text: option.formatTag.toUpperCase(), color: 'bg-purple-500/15 text-purple-300 border-purple-500/25' };
  }
  if (option.id === 'best-video-mp4') {
    return { text: 'AUTO BEST', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  }
  if (option.height >= 2160) {
    return { text: '4K', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' };
  }
  if (option.height >= 1440) {
    return { text: '2K', color: 'bg-blue-500/15 text-blue-300 border-blue-500/25' };
  }
  if (option.height >= 1080) {
    return { text: '1080p', color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25' };
  }
  if (option.height >= 720) {
    return { text: '720p', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' };
  }
  return { text: `${option.height}p`, color: 'bg-white/8 text-white/60 border-white/10' };
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `~${mb.toFixed(0)} MB`;
  return `~${(mb / 1024).toFixed(1)} GB`;
}

export function QualitySelector({ options, selected, onSelect }: QualitySelectorProps) {
  // Categorize options
  const videoOptions = options.filter(o => o.mediaType === 'video' || (!o.isAudioOnly && o.mediaType !== 'image'));
  const audioOptions = options.filter(o => o.isAudioOnly || o.mediaType === 'audio');
  const imageOptions = options.filter(o => o.mediaType === 'image');

  return (
    <div className="space-y-4">
      {/* Video Options */}
      {videoOptions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
              Video Formats (MP4)
            </span>
          </div>
          <div className="space-y-1.5">
            {videoOptions.map(option => (
              <QualityOptionItem
                key={option.id}
                option={option}
                isSelected={selected?.id === option.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {/* Audio Only Options */}
      {audioOptions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 18V5l12-2v13"/>
                <circle cx="6" cy="18" r="3"/>
                <circle cx="18" cy="16" r="3"/>
              </svg>
              Audio Only (MP3 / M4A)
            </span>
          </div>
          <div className="space-y-1.5">
            {audioOptions.map(option => (
              <QualityOptionItem
                key={option.id}
                option={option}
                isSelected={selected?.id === option.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {/* Image Options */}
      {imageOptions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              Image Download (JPG / PNG / WebP)
            </span>
          </div>
          <div className="space-y-1.5">
            {imageOptions.map(option => (
              <QualityOptionItem
                key={option.id}
                option={option}
                isSelected={selected?.id === option.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QualityOptionItem({
  option,
  isSelected,
  onSelect,
}: {
  option: QualityOption;
  isSelected: boolean;
  onSelect: (o: QualityOption) => void;
}) {
  const badge = getOptionBadge(option);
  const isBest = option.id === 'best-video-mp4';

  return (
    <button
      type="button"
      onClick={() => onSelect(option)}
      className={`
        w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all duration-200 text-left
        ${isSelected
          ? 'bg-brand-600/20 border-brand-500/50 shadow-sm shadow-brand-500/10'
          : isBest
          ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/30'
          : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
        }
      `}
    >
      {/* Radio Circle */}
      <div
        className={`
          w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-150
          ${isSelected
            ? 'border-brand-500 bg-brand-500'
            : 'border-white/20'
          }
        `}
      >
        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>

      {/* Label and Badge */}
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`
              text-sm font-semibold truncate transition-colors duration-150
              ${isSelected ? 'text-white' : 'text-white/80'}
            `}
          >
            {option.label}
          </p>
          {option.estimatedSize && (
            <p className="text-xs text-white/35 mt-0.5">{formatSize(option.estimatedSize)}</p>
          )}
        </div>

        {/* Quality Tag Badge */}
        <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold flex-shrink-0 ${badge.color}`}>
          {badge.text}
        </span>
      </div>
    </button>
  );
}
