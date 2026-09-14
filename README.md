# Media Downloader

A professional Windows desktop application for downloading videos and audio from thousands of supported websites. Built with Electron, React, TypeScript, Vite, and Tailwind CSS. Powered by **yt-dlp** and **FFmpeg** — all processing happens entirely on your PC.

---

## Features

- 🎬 Download video + audio in a single merged file
- 🎵 Audio-only downloads (MP3, M4A)
- 📊 Real-time download progress with speed and ETA
- 🎨 Beautiful dark glassmorphism UI
- 🔒 Secure: no external servers, no cloud processing
- 📁 Native Windows folder picker
- 📜 Download history with file management
- ⚙️ Configurable settings
- 🖥️ Windows 10/11 native integration (system tray, notifications)

---

## Architecture

```
React UI (Renderer Process)
    ↓ contextBridge IPC (contextIsolation: true, nodeIntegration: false)
Electron Preload (preload.ts)
    ↓ ipcMain handlers
Electron Main Process (main.ts)
    ↓ spawn() — safe arg arrays, never shell concat
yt-dlp.exe → metadata + stream download
    ↓ when video-only stream needs audio
ffmpeg.exe → -c copy merge (no re-encode)
    ↓
Final .mp4 / .webm / .mp3 / .m4a
    ↓
User-chosen output folder
```

---

## Requirements

### Development
- Node.js 18+
- npm 9+

### Required Binaries (place in `resources/bin/`)
| File | Source |
|------|--------|
| `yt-dlp.exe` | https://github.com/yt-dlp/yt-dlp/releases/latest |
| `ffmpeg.exe` | https://ffmpeg.org/download.html (Windows build) |
| `ffprobe.exe` | Same FFmpeg package as ffmpeg.exe |

> **The binaries are NOT included in source control.** You must download and place them manually.

---

## Installation

### 1. Clone / extract the project
```bash
cd media-downloader
```

### 2. Install Node.js dependencies
```bash
npm install
```

### 3. Download required binaries
Download and place these files in `resources/bin/`:
- **yt-dlp.exe**: https://github.com/yt-dlp/yt-dlp/releases — download `yt-dlp.exe`
- **ffmpeg.exe** + **ffprobe.exe**: https://www.gyan.dev/ffmpeg/builds/ — download the "release essentials" build

### 4. Run in development
```bash
npm run dev
```
This starts the Vite dev server and Electron simultaneously.

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development mode (Vite + Electron) |
| `npm run build` | Build TypeScript + Vite bundle |
| `npm run dist` | Build production Windows installer |
| `npm run dist:win` | Build Windows installer explicitly |
| `npm run typecheck` | TypeScript type check only |

---

## How Video+Audio Merging Works

YouTube and many other sites serve high-quality video (1080p+) as **video-only** streams that have no audio track. A separate audio-only stream must be downloaded and merged.

### The flow:

```
User selects 1080p MP4
        ↓
yt-dlp format selector:
  bestvideo[height<=1080][ext=mp4] + bestaudio[ext=m4a]
        ↓
yt-dlp downloads both streams to temp dir
        ↓
yt-dlp invokes FFmpeg internally with:
  ffmpeg -i video.mp4 -i audio.m4a -c copy output.mp4
        ↓
-c copy = stream copy, NO re-encoding
        ↓
Final output.mp4 (has both picture and sound)
        ↓
Moved to user's chosen output folder
```

The `-c copy` flag is critical: it avoids re-encoding, so 4K video merges in seconds rather than hours.

---

## How yt-dlp Works in This Application

yt-dlp is called via Node.js `spawn()` with safe argument arrays (never shell-concatenated strings):

```typescript
// SAFE — URL is an argument, not concatenated
spawn(ytDlpPath, ['--dump-json', '--no-playlist', url])

// NEVER do this (shell injection risk):
exec('yt-dlp ' + userUrl)  // ❌
```

### Analysis phase:
```bash
yt-dlp --dump-json --no-playlist <url>
```
Returns JSON with title, thumbnail, duration, and all available formats.

### Download phase:
```bash
yt-dlp -f "137+140" --merge-output-format mp4 -o "%(title)s.%(ext)s" <url>
```
Where `137+140` are the specific format IDs for 1080p video + best audio.

---

## Building the Windows .exe

### Prerequisites
1. Complete the installation steps above
2. Ensure `resources/bin/` contains `yt-dlp.exe`, `ffmpeg.exe`, `ffprobe.exe`

### Build
```bash
npm run dist
```

### Output location
```
release/
  Media Downloader Setup 1.0.0.exe   ← NSIS installer
  MediaDownloader-Portable.exe        ← Portable executable
```

The installer will create Start Menu and Desktop shortcuts.

---

## Project Structure

```
media-downloader/
├── electron/
│   ├── main.ts                  # Electron entry, BrowserWindow
│   ├── preload.ts               # contextBridge safe API
│   ├── types.ts                 # Shared type definitions
│   ├── ipc/
│   │   └── handlers.ts          # ipcMain.handle() registrations
│   ├── downloader/
│   │   ├── ytdlp.ts             # yt-dlp wrapper (analyze + download)
│   │   ├── ffmpeg.ts            # FFmpeg merge/convert wrapper
│   │   ├── formats.ts           # Format parsing & quality mapping
│   │   ├── downloadManager.ts   # Job queue, concurrency, lifecycle
│   │   └── processManager.ts    # Child process tracking & kill
│   └── utils/
│       ├── paths.ts             # Binary path resolution (dev vs prod)
│       ├── sanitize.ts          # Filename sanitization
│       ├── diskSpace.ts         # Disk space utilities
│       └── history.ts           # JSON-based download history
├── src/
│   ├── components/              # React UI components
│   ├── pages/                   # Home, Downloads, Settings pages
│   ├── hooks/                   # useDownload, useSettings hooks
│   ├── services/ipc.ts          # Type-safe IPC bridge
│   ├── types/index.ts           # Renderer-side types
│   ├── App.tsx                  # Root component + navigation
│   └── main.tsx                 # React entry point
├── resources/
│   └── bin/                     # Place yt-dlp.exe, ffmpeg.exe, ffprobe.exe here
├── public/                      # Static assets (icon)
├── package.json
├── tsconfig.json                # Renderer TypeScript config
├── tsconfig.electron.json       # Main process TypeScript config (CommonJS)
├── vite.config.ts
└── tailwind.config.js
```

---

## Troubleshooting

### "yt-dlp not found"
Place `yt-dlp.exe` in `resources/bin/`. Use the diagnostics panel in the app (bottom of home screen) to verify paths.

### "FFmpeg not found"
Place `ffmpeg.exe` and `ffprobe.exe` in `resources/bin/`.

### "Invalid URL" for a site you think is supported
Run `yt-dlp <url>` manually in a terminal to confirm yt-dlp supports it. The app uses yt-dlp's extractor system directly.

### Download completes but no audio
This means yt-dlp couldn't find or use a compatible audio stream. Try:
1. Selecting a different quality (lower may have audio built-in)
2. Checking yt-dlp version is up-to-date

### Build fails on electron-builder
Ensure `resources/bin/` exists (even empty) and the `extraResources` path in `package.json` is correct.

---

## Updating Dependencies

### Update yt-dlp
Download the latest `yt-dlp.exe` from https://github.com/yt-dlp/yt-dlp/releases and replace `resources/bin/yt-dlp.exe`.

### Update FFmpeg
Download the latest Windows build from https://ffmpeg.org/download.html and replace `resources/bin/ffmpeg.exe` and `ffprobe.exe`.

### Update Node.js packages
```bash
npm update
```

---

## Security Notes

- **contextIsolation: true** — renderer cannot access Node.js APIs directly
- **nodeIntegration: false** — no Node.js in renderer process
- **Safe process spawning** — user URLs are always array arguments, never shell-concatenated
- **Filename sanitization** — downloaded filenames are sanitized before writing to disk
- **Path validation** — output paths are validated to prevent directory traversal

---

## Legal Notes

This application is a **download client** using yt-dlp. It is intended for:
- Downloading content you own or have permission to download
- Downloading freely-available content where the platform allows it
- Personal/educational use

**Do not use this tool to:**
- Circumvent DRM or copy protection
- Bypass paywalls or authentication
- Download content you do not have permission to access
- Violate copyright law or platform Terms of Service

Respect the licenses of [yt-dlp](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE) (Unlicense) and [FFmpeg](https://ffmpeg.org/legal.html) (LGPL/GPL).
