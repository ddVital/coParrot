import micromatch, { Options as MicromatchOptions } from 'micromatch';

interface ValidationResult {
  valid: string[];
  invalid: string[];
}

/**
 * Filters an array of file paths based on glob patterns
 */
export function filterByGlob(
  files: string[],
  patterns: string[],
  options: MicromatchOptions = {}
): string[] {
  if (!files || files.length === 0) {
    return [];
  }

  if (!patterns || patterns.length === 0) {
    return files;
  }

  // Filter out files that match any of the ignore patterns
  return files.filter(file => {
    return !matchesAnyPattern(file, patterns, options);
  });
}

/**
 * Checks if a file path matches any of the provided glob patterns
 */
export function matchesAnyPattern(
  filePath: string,
  patterns: string[],
  options: MicromatchOptions = {}
): boolean {
  if (!filePath || !patterns || patterns.length === 0) {
    return false;
  }

  const defaultOptions: MicromatchOptions = {
    dot: true,           // Match dotfiles
    nocase: false,       // Case-sensitive by default
    matchBase: true,     // Allow matching basename only
    ...options
  };

  return micromatch.isMatch(filePath, patterns, defaultOptions);
}

/**
 * Gets files that match the provided glob patterns (inverse of filterByGlob)
 */
export function matchByGlob(
  files: string[],
  patterns: string[],
  options: MicromatchOptions = {}
): string[] {
  if (!files || files.length === 0) {
    return [];
  }

  if (!patterns || patterns.length === 0) {
    return [];
  }

  const defaultOptions: MicromatchOptions = {
    dot: true,
    nocase: false,
    matchBase: true,
    ...options
  };

  return micromatch(files, patterns, defaultOptions);
}

/**
 * Normalizes file paths for consistent matching
 */
export function normalizeFilePath(filePath: string): string {
  if (!filePath) return '';

  return filePath
    .replace(/\\/g, '/')      // Convert backslashes to forward slashes
    .replace(/^\.\//, '')     // Remove leading ./
    .replace(/\/\//g, '/');   // Remove double slashes
}

/**
 * Normalizes an array of file paths
 */
export function normalizeFilePaths(files: string[]): string[] {
  if (!files || !Array.isArray(files)) {
    return [];
  }

  return files.map(normalizeFilePath);
}

/**
 * Validates glob patterns to ensure they're properly formatted
 */
export function validatePatterns(patterns: string[]): ValidationResult {
  if (!patterns || !Array.isArray(patterns)) {
    return { valid: [], invalid: [] };
  }

  const valid: string[] = [];
  const invalid: string[] = [];

  patterns.forEach(pattern => {
    try {
      // Test if micromatch can parse the pattern
      micromatch(['test.js'], pattern);
      valid.push(pattern);
    } catch (error) {
      invalid.push(pattern);
    }
  });

  return { valid, invalid };
}

/**
 * Common preset patterns for ignoring files
 */
export const COMMON_IGNORE_PATTERNS = {
  tests: ['**/*.test.js', '**/*.spec.js', '**/__tests__/**'],
  docs: ['**/*.md', '**/docs/**', '**/documentation/**'],
  config: ['**/*.config.js', '**/.*.js', '**/.*rc', '**/.*rc.js', '**/.*rc.json'],
  build: ['**/dist/**', '**/build/**', '**/out/**', '**/.next/**'],
  dependencies: ['**/node_modules/**', '**/vendor/**'],
  logs: ['**/*.log', '**/logs/**'],
  temp: ['**/*.tmp', '**/temp/**', '**/.cache/**'],
  all: function(): string[] {
    return Object.values(this)
      .filter((v): v is string[] => Array.isArray(v))
      .flat();
  }
};

export default {
  filterByGlob,
  matchesAnyPattern,
  matchByGlob,
  normalizeFilePath,
  normalizeFilePaths,
  validatePatterns,
  COMMON_IGNORE_PATTERNS
};
