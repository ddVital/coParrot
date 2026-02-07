import os from 'os';
import path from 'path';

export const isWindows = process.platform === 'win32';

/**
 * Returns the platform-appropriate config directory for coparrot.
 * Windows: %APPDATA%/coparrot
 * Unix:    ~/.config/coparrot
 */
export function getConfigDir(): string {
  if (isWindows) {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'coparrot');
  }
  return path.join(os.homedir(), '.config', 'coparrot');
}

/**
 * Escape a string for safe use in shell commands.
 * Windows: double-quote escaping
 * Unix:    single-quote escaping
 */
export function shellEscape(str: string): string {
  if (isWindows) {
    // Double-quote escaping: escape double quotes, percent signs, and carets
    return `"${str.replace(/["%^]/g, '^$&')}"`;
  }
  // Single-quote escaping: replace ' with '\'' (end quote, escaped quote, start quote)
  return `'${str.replace(/'/g, "'\\''")}'`;
}
