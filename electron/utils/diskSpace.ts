import fs from 'fs';
import path from 'path';

/**
 * Get available disk space by checking the target drive.
 * Uses a fallback approach compatible with all Node.js versions.
 */
export async function getAvailableSpace(targetPath: string): Promise<number | null> {
  try {
    // Try statfsSync (Node.js 18.15+)
    const stats = (fs as typeof fs & { statfsSync?: (path: string) => { bfree: number; bsize: number } }).statfsSync?.(path.resolve(targetPath));
    if (stats) return stats.bfree * stats.bsize;
  } catch {
    // Not available on this Node version
  }
  return null;
}

/**
 * Ensure sufficient disk space is available.
 * Returns an error message if insufficient, or null if OK.
 */
export async function checkDiskSpace(
  targetPath: string,
  estimatedBytes: number | null
): Promise<string | null> {
  if (estimatedBytes === null) return null;

  const available = await getAvailableSpace(targetPath);
  if (available === null) return null; // Can't check, proceed

  const requiredWithBuffer = estimatedBytes * 2;
  if (available < requiredWithBuffer) {
    const availableMB = Math.floor(available / 1024 / 1024);
    const requiredMB = Math.floor(requiredWithBuffer / 1024 / 1024);
    return `Insufficient disk space. Available: ${availableMB} MB, Required: ~${requiredMB} MB`;
  }

  return null;
}

/**
 * Check if a directory is writable.
 */
export async function isDirectoryWritable(dirPath: string): Promise<boolean> {
  try {
    // Ensure the directory exists first
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const testFile = path.join(dirPath, `.write-test-${Date.now()}`);
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}
