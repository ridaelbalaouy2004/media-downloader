import React from 'react';
import { ipc } from '../services/ipc';

interface DeveloperSectionProps {
  variant?: 'sidebar' | 'hero' | 'footer';
  className?: string;
}

export function DeveloperSection({ variant = 'hero', className = '' }: DeveloperSectionProps) {
  const socialLinks = [
    {
      name: 'LinkedIn',
      url: 'https://www.linkedin.com/in/rida-elbalaouy-2a8b5632b/',
      hoverColor: 'hover:text-[#0a66c2] hover:bg-[#0a66c2]/10 hover:border-[#0a66c2]/40',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28z"/>
        </svg>
      ),
    },
    {
      name: 'Instagram',
      url: 'https://www.instagram.com/_its__reda?stkn=MWttMjVjcm0xMXBjNQ==',
      hoverColor: 'hover:text-[#e1306c] hover:bg-[#e1306c]/10 hover:border-[#e1306c]/40',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
        </svg>
      ),
    },
    {
      name: 'Facebook',
      url: 'https://www.facebook.com/profile.php?id=61592590894753',
      hoverColor: 'hover:text-[#1877f2] hover:bg-[#1877f2]/10 hover:border-[#1877f2]/40',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
    },
    {
      name: 'GitHub',
      url: 'https://github.com/ridaelbalaouy2004',
      hoverColor: 'hover:text-white hover:bg-white/10 hover:border-white/40',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
        </svg>
      ),
    },
    {
      name: 'Gmail',
      url: 'mailto:elbalaouyrida@gmail.com',
      hoverColor: 'hover:text-[#ea4335] hover:bg-[#ea4335]/10 hover:border-[#ea4335]/40',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
        </svg>
      ),
    },
  ];

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    ipc.openExternal(url);
  };

  // ─── Sidebar Variant (Permanent, Compact, Visible Across All Views) ─────────
  if (variant === 'sidebar') {
    return (
      <div className={`p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md space-y-2.5 ${className}`}>
        {/* Developer signature */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-500/30">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-semibold tracking-wider text-brand-300/80 leading-none">Developer</p>
            <p className="text-xs font-bold text-white truncate mt-0.5">Reda Elbalaouy</p>
          </div>
        </div>

        {/* Connect with me */}
        <div>
          <p className="text-[10px] font-medium text-white/50 mb-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Connect with me
          </p>

          <div className="flex items-center justify-between gap-1">
            {socialLinks.map((link) => (
              <button
                key={link.name}
                onClick={(e) => handleLinkClick(e, link.url)}
                title={link.name}
                aria-label={link.name}
                className={`
                  p-1.5 rounded-lg bg-white/[0.04] text-white/60 border border-white/5
                  transition-all duration-150 transform hover:scale-110 active:scale-95
                  ${link.hoverColor}
                `}
              >
                {link.icon}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Hero / Header Variant (Under Title) ──────────────────────────────────
  if (variant === 'hero') {
    return (
      <div className={`inline-flex flex-col sm:flex-row items-center gap-3 sm:gap-4 p-2.5 px-4 rounded-2xl bg-surface-800/80 border border-brand-500/20 backdrop-blur-xl shadow-lg shadow-brand-950/40 ${className}`}>
        {/* Developer signature */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-brand-500 via-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-brand-500/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </div>
          <div className="text-left">
            <span className="text-xs text-white/50 font-normal">Developed by </span>
            <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-brand-200 to-brand-400">
              Reda Elbalaouy
            </span>
          </div>
        </div>

        <div className="hidden sm:block w-px h-5 bg-white/10" />

        {/* Connect with me */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/60">Connect with me:</span>
          <div className="flex items-center gap-1.5">
            {socialLinks.map((link) => (
              <button
                key={link.name}
                onClick={(e) => handleLinkClick(e, link.url)}
                title={link.name}
                aria-label={link.name}
                className={`
                  p-1.5 rounded-lg bg-surface-700/60 text-white/60 border border-white/5
                  transition-all duration-150 transform hover:scale-115 active:scale-95
                  ${link.hoverColor}
                `}
              >
                {link.icon}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Card / Footer Variant ────────────────────────────────────────────────
  return (
    <div className={`p-5 rounded-2xl bg-gradient-to-br from-surface-800/90 via-surface-850/90 to-surface-900 border border-brand-500/20 shadow-xl backdrop-blur-xl ${className}`}>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Signature */}
        <div className="flex items-center gap-3.5 text-center sm:text-left">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-600/30">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">Developer Signature</p>
            <h4 className="text-base font-black text-white tracking-tight">Developed by Reda Elbalaouy</h4>
          </div>
        </div>

        {/* Connect with me section */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <span className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
            Connect with me
          </span>
          <div className="flex items-center gap-2">
            {socialLinks.map((link) => (
              <button
                key={link.name}
                onClick={(e) => handleLinkClick(e, link.url)}
                title={link.name}
                aria-label={link.name}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-700/60 text-white/70 border border-white/5 text-xs font-medium
                  transition-all duration-150 transform hover:scale-105 active:scale-95
                  ${link.hoverColor}
                `}
              >
                {link.icon}
                <span className="hidden md:inline">{link.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
