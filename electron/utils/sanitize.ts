import path from 'path';

/**
 * Sanitize a string to be safe as a Windows filename.
 * Removes characters illegal in Windows file paths.
 */
export function sanitizeFilename(name: string, maxLength = 200): string {
  if (!name) return 'download';

  let sanitized = name
    // Replace Windows-illegal characters with safe equivalents
    .replace(/[\\/:*?"<>|]/g, '-')
    // Replace control characters
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Normalize multiple spaces/dashes
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    // Trim leading/trailing spaces and dots (Windows restriction)
    .trim()
    .replace(/^\.+|\.+$/g, '');

  // Ensure it's not a reserved Windows filename
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reserved.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  // Truncate to reasonable length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim();
  }

  return sanitized || 'download';
}

/**
 * Generate a safe output filename from a video title and extension.
 */
export function buildOutputFilename(title: string, ext: string): string {
  const safe = sanitizeFilename(title);
  const cleanExt = ext.replace(/^\./, ''); // remove leading dot if present
  return `${safe}.${cleanExt}`;
}

/**
 * Validate that a path does not escape intended boundaries (path traversal prevention).
 */
export function validateOutputPath(outputDir: string, filename: string): boolean {
  const fullPath = path.resolve(outputDir, filename);
  return fullPath.startsWith(path.resolve(outputDir));
}
