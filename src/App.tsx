import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { HomePage } from './pages/HomePage';
import { DownloadsPage } from './pages/DownloadsPage';
import { SettingsPage } from './pages/SettingsPage';
import { DeveloperSection } from './components/DeveloperSection';
import { useSettings } from './hooks/useSettings';
import { ipc } from './services/ipc';
import { useDownloads } from './hooks/useDownload';

import { QueuePage } from './pages/QueuePage';

type Page = 'home' | 'queue' | 'downloads' | 'settings';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const { settings, updateSetting, resetSettings } = useSettings();
  const { activeJobs, queuedJobs } = useDownloads();

  const totalPending = activeJobs.length + queuedJobs.length;

  // Listen for completion notifications and show browser notifications
  useEffect(() => {
    const unsub = ipc.onCompletedNotification(({ title }) => {
      if (Notification.permission === 'granted') {
        new Notification('Download Complete', {
          body: title,
          icon: undefined,
        });
      }
    });

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return unsub;
  }, []);

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    {
      id: 'home',
      label: 'Download',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      ),
    },
    {
      id: 'queue',
      label: 'Queue',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      ),
    },
    {
      id: 'downloads',
      label: 'History',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20 12h-2M4 12H2M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20v-2M12 4V2"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-surface-900 text-white overflow-hidden">
      {/* Custom title bar */}
      <TitleBar />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar navigation */}
        <nav className="w-52 flex-shrink-0 border-r border-white/5 bg-surface-800/50 backdrop-blur-xl flex flex-col py-4 px-3">
          {/* Logo area */}
          <div className="px-3 pb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-600/30">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </div>
              <div>
                <p className="text-xs font-black text-white/90 leading-none">Media</p>
                <p className="text-xs font-black text-white/90 leading-none">Downloader</p>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <div className="space-y-1 flex-1">
            {navItems.map(item => (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setCurrentPage(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150
                  ${currentPage === item.id
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'
                  }
                `}
              >
                <span className={currentPage === item.id ? 'text-brand-400' : 'text-white/30'}>
                  {item.icon}
                </span>
                {item.label}

                {/* Queue pending items badge */}
                {item.id === 'queue' && totalPending > 0 && (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-brand-500 text-white font-mono font-bold text-[11px] animate-pulse">
                    {totalPending}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Permanent Developer Section & Branding */}
          <div className="pt-3 border-t border-white/5">
            <DeveloperSection variant="sidebar" />
          </div>
        </nav>

        {/* Page content */}
        <main className="flex-1 overflow-hidden bg-surface-900">
          {/* Subtle background gradient */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-brand-600/5 blur-3xl rounded-full" />
          </div>

          <div className="relative h-full">
            {currentPage === 'home' && (
              <HomePage
                settings={settings}
                onNavigateQueue={() => setCurrentPage('queue')}
              />
            )}
            {currentPage === 'queue' && (
              <QueuePage
                onNavigateHome={() => setCurrentPage('home')}
              />
            )}
            {currentPage === 'downloads' && <DownloadsPage />}
            {currentPage === 'settings' && (
              <SettingsPage
                settings={settings}
                onUpdate={updateSetting}
                onReset={resetSettings}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
