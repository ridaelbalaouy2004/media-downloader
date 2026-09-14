import React from 'react';
import type { AppSettings } from '../types';
import { ipc } from '../services/ipc';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onReset: () => void;
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}

function Toggle({ checked, onChange, id }: ToggleProps) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`
        relative w-10 h-5.5 rounded-full transition-all duration-200 flex-shrink-0
        ${checked ? 'bg-brand-600' : 'bg-white/15'}
      `}
    >
      <div className={`
        absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-all duration-200
        ${checked ? 'left-[22px]' : 'left-0.5'}
      `} />
    </button>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/80">{label}</p>
        {description && (
          <p className="text-xs text-white/35 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-2 mt-6 first:mt-0">
      <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">{title}</h3>
      {description && <p className="text-xs text-white/25 mt-0.5">{description}</p>}
    </div>
  );
}

export function SettingsPage({ settings, onUpdate, onReset }: SettingsPageProps) {
  const handleChooseDefaultFolder = async () => {
    const result = await ipc.chooseFolder();
    if (!result.cancelled && result.path) {
      onUpdate('defaultDownloadDir', result.path);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      onReset();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-black text-white/90">Settings</h1>
        <p className="text-sm text-white/40 mt-0.5">Configure your download preferences</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1">
        {/* Downloads section */}
        <div className="rounded-2xl border border-white/8 bg-surface-700/40 px-5">
          <SectionHeader title="Downloads" />

          <SettingRow
            label="Default Download Folder"
            description="Where downloads are saved by default"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40 max-w-32 truncate font-mono" title={settings.defaultDownloadDir}>
                {settings.defaultDownloadDir.split('\\').pop() || settings.defaultDownloadDir}
              </span>
              <button
                onClick={handleChooseDefaultFolder}
                id="settings-choose-folder"
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-600 hover:bg-surface-500 border border-white/10 hover:border-white/20 text-white/60 hover:text-white transition-all duration-150"
              >
                Change
              </button>
            </div>
          </SettingRow>

          <SettingRow
            label="Max Concurrent Downloads"
            description="How many downloads run simultaneously"
          >
            <select
              id="settings-concurrent"
              value={settings.maxConcurrentDownloads}
              onChange={e => onUpdate('maxConcurrentDownloads', parseInt(e.target.value))}
              className="bg-surface-600 border border-white/10 text-white/70 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-brand-500/50 transition-colors duration-150"
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n} download{n > 1 ? 's' : ''}</option>
              ))}
            </select>
          </SettingRow>
        </div>

        {/* Defaults section */}
        <div className="rounded-2xl border border-white/8 bg-surface-700/40 px-5">
          <SectionHeader title="Defaults" />

          <SettingRow
            label="Default Quality"
            description="Preferred quality when analyzing videos"
          >
            <select
              id="settings-quality"
              value={settings.defaultQuality}
              onChange={e => onUpdate('defaultQuality', e.target.value)}
              className="bg-surface-600 border border-white/10 text-white/70 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-brand-500/50 transition-colors duration-150"
            >
              <option value="2160p">4K (2160p)</option>
              <option value="1440p">2K (1440p)</option>
              <option value="1080p">1080p Full HD</option>
              <option value="720p">720p HD</option>
              <option value="480p">480p</option>
              <option value="360p">360p</option>
            </select>
          </SettingRow>

          <SettingRow
            label="Default Format"
            description="Preferred output container format"
          >
            <select
              id="settings-format"
              value={settings.defaultFormat}
              onChange={e => onUpdate('defaultFormat', e.target.value)}
              className="bg-surface-600 border border-white/10 text-white/70 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-brand-500/50 transition-colors duration-150"
            >
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
            </select>
          </SettingRow>
        </div>

        {/* Appearance section */}
        <div className="rounded-2xl border border-white/8 bg-surface-700/40 px-5">
          <SectionHeader title="Appearance" />

          <SettingRow label="Theme" description="Application color theme">
            <div className="flex items-center gap-1 bg-surface-600 rounded-lg p-1 border border-white/8">
              {(['dark', 'light'] as const).map(theme => (
                <button
                  key={theme}
                  id={`settings-theme-${theme}`}
                  onClick={() => onUpdate('theme', theme)}
                  className={`
                    px-3 py-1 rounded-md text-xs font-medium capitalize transition-all duration-150
                    ${settings.theme === theme
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-white/40 hover:text-white/70'
                    }
                  `}
                >
                  {theme}
                </button>
              ))}
            </div>
          </SettingRow>
        </div>

        {/* Updates section */}
        <div className="rounded-2xl border border-white/8 bg-surface-700/40 px-5">
          <SectionHeader title="Updates" description="Automatic update checks on startup" />

          <SettingRow
            label="Auto-check yt-dlp updates"
            description="Check for yt-dlp updates when app starts"
          >
            <Toggle
              id="settings-ytdlp-updates"
              checked={settings.autoCheckYtDlpUpdates}
              onChange={v => onUpdate('autoCheckYtDlpUpdates', v)}
            />
          </SettingRow>

          <SettingRow
            label="Auto-check FFmpeg updates"
            description="Check for FFmpeg updates when app starts"
          >
            <Toggle
              id="settings-ffmpeg-updates"
              checked={settings.autoCheckFfmpegUpdates}
              onChange={v => onUpdate('autoCheckFfmpegUpdates', v)}
            />
          </SettingRow>
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl border border-red-500/15 bg-red-500/5 px-5 py-4">
          <h3 className="text-xs font-bold text-red-400/60 uppercase tracking-wider mb-3">Danger Zone</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white/60">Reset Settings</p>
              <p className="text-xs text-white/30 mt-0.5">Restore all settings to their defaults</p>
            </div>
            <button
              onClick={handleReset}
              id="settings-reset"
              className="px-4 py-2 rounded-xl text-xs font-medium text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 transition-all duration-150"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Legal note */}
        <div className="text-center py-4">
          <p className="text-xs text-white/20 leading-relaxed max-w-md mx-auto">
            This application uses yt-dlp and FFmpeg. Only download content you have permission to download.
            Respect copyright and platform terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}
