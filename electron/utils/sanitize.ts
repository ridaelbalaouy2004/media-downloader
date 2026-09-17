import path from 'path';

// Windows reserved device names (cannot be used as file or folder names, case-insensitive)
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

function isWindowsReservedName(name: string): boolean {
  return WINDOWS_RESERVED_NAMES.has(name.toUpperCase());
}

/**
 * Strips ALL trailing dots and spaces strictly and replaces Windows reserved characters.
 * Guarantees Windows cannot throw "Location is not available" due to stripped trailing dots/spaces.
 */
export function sanitizeWindowsName(name: string): string {
  if (!name || typeof name !== 'string') return 'Untitled';

  let sanitized = name
    .trim()                          // 1. Remove leading/trailing spaces
    .replace(/[.\s]+$/, '')          // 2. Strips ALL trailing dots and spaces strictly
    .replace(/[\\/:*?"<>|]/g, '_')   // 3. Replace Windows reserved characters
    .trim();                         // 4. Final safety trim

  // Re-check trailing dots/spaces in case replacement left any
  sanitized = sanitized.replace(/[.\s]+$/, '').trim();

  // Handle Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  if (isWindowsReservedName(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  return sanitized || 'Untitled';
}

/**
 * Sanitize a filename with safe length limits.
 */
export function sanitizeFilename(name: string, maxLength = 180): string {
  let clean = sanitizeWindowsName(name);
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength).replace(/[.\s]+$/, '').trim();
  }
  return clean || 'Untitled';
}

/**
 * Sanitize a folder/directory name (e.g. playlist folder).
 */
export function sanitizeFolderName(name: string, maxLength = 150): string {
  let clean = sanitizeWindowsName(name);
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength).replace(/[.\s]+$/, '').trim();
  }
  return clean || 'Untitled';
}

/**
 * Generate a safe output filename from a media title and file extension.
 * Crucial: If ext is empty or not supplied, does NOT append a trailing dot!
 */
export function buildOutputFilename(title: string, ext?: string | null, maxLength = 180): string {
  const safeBase = sanitizeFilename(title, maxLength);

  if (!ext || typeof ext !== 'string') {
    return safeBase;
  }

  const cleanExt = ext
    .replace(/^\./, '')
    .trim()
    .replace(/[.\s]+$/, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .toLowerCase();

  if (!cleanExt) {
    return safeBase;
  }

  if (isWindowsReservedName(safeBase)) {
    return `_${safeBase}.${cleanExt}`;
  }

  return `${safeBase}.${cleanExt}`;
}

/**
 * Fully sanitize a complete file or directory path, ensuring no directory segment
 * ends with a dot or space.
 */
export function sanitizePath(targetPath: string): string {
  if (!targetPath || typeof targetPath !== 'string') return '';
  const normalized = path.normalize(targetPath);
  const parts = normalized.split(path.sep);
  const cleanedParts = parts.map((part, idx) => {
    // Preserve Windows drive root (e.g. "C:")
    if (idx === 0 && /^[a-zA-Z]:$/.test(part)) return part;
    if (!part) return '';
    return sanitizeWindowsName(part);
  });
  return path.resolve(cleanedParts.join(path.sep));
}

/**
 * Safe path builder using path.join() exclusively.
 * Strips all trailing dots and spaces from every segment.
 */
export function safeJoinPath(...segments: string[]): string {
  const cleanedSegments = segments.map((seg, idx) => {
    if (!seg) return '';
    // Preserve drive root if first segment
    if (idx === 0 && /^[a-zA-Z]:[\\/]?$/.test(seg)) {
      return seg;
    }
    if (seg.includes('/') || seg.includes('\\')) {
      return sanitizePath(seg);
    }
    return sanitizeWindowsName(seg);
  });
  return path.join(...cleanedSegments);
}

/**
 * Validate that a path does not escape intended boundaries (path traversal prevention).
 */
export function validateOutputPath(outputDir: string, filename: string): boolean {
  const fullPath = path.resolve(outputDir, filename);
  return fullPath.startsWith(path.resolve(outputDir));
}
