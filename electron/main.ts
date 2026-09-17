import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { registerIpcHandlers } from './ipc/handlers';
import { downloadManager } from './downloader/downloadManager';
import { processManager } from './downloader/processManager';
import { getTempDir } from './utils/paths';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = !app.isPackaged && (process.argv.includes('--dev') || process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL);

// Register window control IPC handlers once (not per-window)
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

function resolveIconPath(): string | undefined {
  const appRoot = app.getAppPath();
  const candidates = [
    path.join(appRoot, 'public', 'icon.ico'),
    path.join(appRoot, 'public', 'icon.png'),
    path.join(appRoot, 'dist', 'icon.ico'),
    path.join(appRoot, 'dist', 'icon.png'),
    path.join(__dirname, '..', '..', 'public', 'icon.ico'),
    path.join(__dirname, '..', '..', 'dist', 'icon.ico'),
  ];
  return candidates.find(p => fs.existsSync(p));
}

function getIndexPath(): string {
  const appRoot = app.getAppPath();
  const candidatePaths = [
    path.join(appRoot, 'dist', 'index.html'),
    path.join(__dirname, '..', '..', 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
  ];
  const found = candidatePaths.find(p => fs.existsSync(p));
  return found || path.join(appRoot, 'dist', 'index.html');
}

function createSplashWindow(): BrowserWindow {
  const iconPath = resolveIconPath();

  const splash = new BrowserWindow({
    width: 480,
    height: 290,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    ...(iconPath ? { icon: iconPath } : {}),
  });

  const appRoot = app.getAppPath();
  const candidatePaths = [
    path.join(appRoot, 'dist/splash.html'),
    path.join(appRoot, 'public/splash.html'),
    path.join(__dirname, '..', '..', 'public', 'splash.html'),
    path.join(__dirname, '..', 'dist', 'splash.html'),
  ];
  const splashHtml = candidatePaths.find(p => fs.existsSync(p));

  if (splashHtml) {
    splash.loadFile(splashHtml);
  } else {
    // Inline fallback guarantee
    splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html><html><body style="margin:0;background:#0d0e17;color:white;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;border:1px solid #7c3aed;border-radius:16px;">
        <h2 style="margin:0 0 10px 0;font-size:20px;">Media Downloader</h2>
        <div style="font-size:18px;font-weight:bold;color:#c4b5fd;">Developed by Reda Elbalaouy</div>
      </body></html>
    `)}`);
  }

  return splash;
}

function createWindow(): void {
  const iconPath = resolveIconPath();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    ...(iconPath ? { icon: iconPath } : {}),
    titleBarStyle: 'hidden',
  });

  downloadManager.setWindow(mainWindow);

  const indexPath = getIndexPath();

  if (app.isPackaged) {
    // Packaged production mode: NEVER touch localhost:5173, load local built bundle
    console.log('[main] Packaged mode: loading local frontend from', indexPath);
    mainWindow.loadFile(indexPath);
  } else if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL).catch(() => {
      mainWindow?.loadFile(indexPath);
    });
    mainWindow.webContents.on('did-fail-load', () => {
      mainWindow?.loadFile(indexPath);
    });
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow?.loadFile(indexPath);
    });
    // Fallback if dev server connection fails or is stopped
    mainWindow.webContents.on('did-fail-load', (_event, _errorCode, _errorDescription, validatedURL) => {
      if (validatedURL.includes('localhost:5173')) {
        console.log('[main] Dev server unavailable, falling back to embedded production build...');
        mainWindow?.loadFile(indexPath);
      }
    });
  } else {
    // Standalone production mode: load embedded files directly
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray(): void {
  try {
    const iconPath = resolveIconPath();
    if (!iconPath) return;

    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Media Downloader',
        click: () => { mainWindow?.show(); mainWindow?.focus(); },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);

    tray.setToolTip('Media Downloader');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
  } catch {
    // Tray is optional — non-fatal
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();

  // 1. Show startup splash screen immediately
  splashWindow = createSplashWindow();
  const splashStartTime = Date.now();
  const SPLASH_MIN_TIME_MS = 2000; // Display for approximately 2 seconds

  // 2. Prepare main window in background
  createWindow();
  createTray();
  downloadManager.cleanAbandonedTempDirs(getTempDir());

  // 3. Transition from splash screen to main window after ~2 seconds
  let transitioned = false;
  const showMainWindow = () => {
    if (transitioned) return;
    transitioned = true;

    const elapsed = Date.now() - splashStartTime;
    const remaining = Math.max(0, SPLASH_MIN_TIME_MS - elapsed);

    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.destroy();
        splashWindow = null;
      }
    }, remaining);
  };

  if (mainWindow) {
    mainWindow.once('ready-to-show', () => {
      showMainWindow();
    });
  }

  // Safety fallback in case ready-to-show event is delayed or skipped
  setTimeout(() => {
    showMainWindow();
  }, SPLASH_MIN_TIME_MS + 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  processManager.killAll();
});

// Security: block external navigation & open external links in default browser
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (navigationUrl.startsWith('http://localhost:5173')) return;
      if (parsed.protocol === 'file:') return;
      event.preventDefault();
      shell.openExternal(navigationUrl);
    } catch {
      event.preventDefault();
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});

