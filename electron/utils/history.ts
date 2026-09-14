import fs from 'fs';
import path from 'path';
import { getAppDataDir, ensureDir } from './paths';
import type { DownloadHistoryEntry } from '../types';

const HISTORY_VERSION = 1;

interface HistoryFile {
  version: number;
  entries: DownloadHistoryEntry[];
}

function getHistoryFilePath(): string {
  const dataDir = getAppDataDir();
  ensureDir(dataDir);
  return path.join(dataDir, 'history.json');
}

function loadHistory(): HistoryFile {
  const filePath = getHistoryFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as HistoryFile;
      if (parsed.version === HISTORY_VERSION && Array.isArray(parsed.entries)) {
        return parsed;
      }
    }
  } catch {
    // Corrupt history — start fresh
  }
  return { version: HISTORY_VERSION, entries: [] };
}

function saveHistory(history: HistoryFile): void {
  const filePath = getHistoryFilePath();
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
}

export function getHistory(): DownloadHistoryEntry[] {
  const history = loadHistory();
  // Return newest first
  return [...history.entries].reverse();
}

export function addHistoryEntry(entry: DownloadHistoryEntry): void {
  const history = loadHistory();
  // Remove existing entry with same jobId if any
  history.entries = history.entries.filter(e => e.jobId !== entry.jobId);
  history.entries.push(entry);
  // Keep last 1000 entries
  if (history.entries.length > 1000) {
    history.entries = history.entries.slice(-1000);
  }
  saveHistory(history);
}

export function removeHistoryEntry(jobId: string): void {
  const history = loadHistory();
  history.entries = history.entries.filter(e => e.jobId !== jobId);
  saveHistory(history);
}

export function clearHistory(): void {
  saveHistory({ version: HISTORY_VERSION, entries: [] });
}
