import React from 'react';
import type { QualityOption } from '../types';

interface QualitySelectorProps {
  options: QualityOption[];
  selected: QualityOption | null;
  onSelect: (option: QualityOption) => void;
}

function getQualityIcon(option: QualityOption): string {
  if (option.isAudioOnly) return '🎵';
  if (option.height >= 2160) return '🔷';
  if (option.height >= 1440) return '💎';
  if (option.height >= 1080) return '⭐';
  if (option.height >= 720) return '✨';
  return '📹';
}

function getQualityBadgeColor(option: QualityOption): string {
  if (option.isAudioOnly) return 'bg-purple-500/15 text-purple-300 border-purple-500/20';
  if (option.height >= 2160) return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20';
  if (option.height >= 1440) return 'bg-blue-500/15 text-blue-300 border-blue-500/20';
  if (option.height >= 1080) return 'bg-brand-500/15 text-brand-300 border-brand-500/20';
  if (option.height >= 720) return 'bg-green-500/15 text-green-300 border-green-500/20';
  return 'bg-white/8 text-white/50 border-white/10';
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `~${mb.toFixed(0)} MB`;
  return `~${(mb / 1024).toFixed(1)} GB`;
}

export function QualitySelector({ options, selected, onSelect }: QualitySelectorProps) {
  // Group options by category
  const videoOptions = options.filter(o => !o.isAudioOnly);
  const audioOptions = options.filter(o => o.isAudioOnly);

  return (
    <div className="space-y-3">
      {videoOptions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-2">Video</p>
          <div className="space-y-1.5">
            {videoOptions.map(option => (
              <QualityOption
                key={option.id}
                option={option}
                isSelected={selected?.id === option.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {audioOptions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-2">Audio Only</p>
          <div className="space-y-1.5">
            {audioOptions.map(option => (
              <QualityOption
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

function QualityOption({
  option,
  isSelected,
  onSelect,
}: {
  option: QualityOption;
  isSelected: boolean;
  onSelect: (o: QualityOption) => void;
}) {
  return (
    <button
      onClick={() => onSelect(option)}
      className={`
        w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all duration-200 text-left
        ${isSelected
          ? 'bg-brand-600/20 border-brand-500/40 shadow-sm shadow-brand-500/10'
          : 'bg-white/3 border-white/6 hover:bg-white/6 hover:border-white/12'
        }
      `}
    >
      {/* Selection indicator */}
      <div
        className={`
          w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-150
          ${isSelected
            ? 'border-brand-500 bg-brand-500'
            : 'border-white/20'
          }
        `}
      >
        {isSelected && (
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
        )}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`
            text-sm font-medium transition-colors duration-150
            ${isSelected ? 'text-white' : 'text-white/70'}
          `}>
            {option.label}
          </span>

          {option.needsMerge && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20 border-solid">
              merged
            </span>
          )}
        </div>

        {option.estimatedSize && (
          <p className="text-xs text-white/30 mt-0.5">{formatSize(option.estimatedSize)}</p>
        )}
      </div>

      {/* Merge indicator */}
      {option.needsMerge && (
        <div className="flex-shrink-0 text-white/25" title="Video and audio will be merged">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 6l6 6-6 6"/>
            <path d="M16 6l6 6-6 6"/>
          </svg>
        </div>
      )}
    </button>
  );
}
