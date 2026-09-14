import { useState, useEffect, useCallback } from 'react';
import type { AppSettings } from '../types';
import { ipc } from '../services/ipc';

const defaultSettings: AppSettings = {
  defaultDownloadDir: '',
  defaultQuality: '1080p',
  defaultFormat: 'mp4',
  maxConcurrentDownloads: 2,
  theme: 'dark',
  autoCheckYtDlpUpdates: false,
  autoCheckFfmpegUpdates: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const result = await ipc.getSettings();
      if (result.success && result.data) {
        setSettings(result.data);
      }

      // Load default downloads dir if not set
      if (!result.data?.defaultDownloadDir) {
        const dirResult = await ipc.getDefaultDownloadsDir();
        if (dirResult.success && dirResult.data) {
          setSettings(prev => ({ ...prev, defaultDownloadDir: dirResult.data! }));
        }
      }
    } catch {
      console.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = useCallback(async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await ipc.setSetting(key, value);
  }, []);

  const resetSettings = useCallback(async () => {
    await ipc.resetSettings();
    await loadSettings();
  }, []);

  return { settings, loading, updateSetting, resetSettings };
}
