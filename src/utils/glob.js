import micromatch from 'micromatch';

/**
 * Filters an array of file paths based on glob patterns
 * @param {string[]} files - Array of file paths to filter
 * @param {string[]} patterns - Array of glob patterns to match against
 * @param {Object} options - Micromatch options
 * @returns {string[]} Filtered array of files that don't match any pattern
 *
 * @example
 * const files = ['src/index.js', 'src/test.spec.js', 'README.md'];
 * const filtered = filterByGlob(files, ['*.md', '*.spec.js']);
 * // Returns: ['src/index.js']
 */
export function filterByGlob(files, patterns, options = {}) {
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
 * @param {string} filePath - File path to check
 * @param {string[]} patterns - Array of glob patterns
 * @param {Object} options - Micromatch options
 * @returns {boolean} True if file matches any pattern
 *
 * @example
 * matchesAnyPattern('src/test.spec.js', ['*.spec.js', '*.test.js']); // true
 * matchesAnyPattern('src/index.js', ['*.spec.js', '*.test.js']); // false
 */
export function matchesAnyPattern(filePath, patterns, options = {}) {
  if (!filePath || !patterns || patterns.length === 0) {
    return false;
  }

  const defaultOptions = {
    dot: true,           // Match dotfiles
    nocase: false,       // Case-sensitive by default
    matchBase: true,     // Allow matching basename only
    ...options
  };

  return micromatch.isMatch(filePath, patterns, defaultOptions);
}

/**
 * Gets files that match the provided glob patterns (inverse of filterByGlob)
 * @param {string[]} files - Array of file paths to filter
 * @param {string[]} patterns - Array of glob patterns to match
 * @param {Object} options - Micromatch options
 * @returns {string[]} Array of files that match any pattern
 *
 * @example
 * const files = ['src/index.js', 'src/test.spec.js', 'README.md'];
 * const matched = matchByGlob(files, ['*.md', '*.spec.js']);
 * // Returns: ['src/test.spec.js', 'README.md']
 */
export function matchByGlob(files, patterns, options = {}) {
  if (!files || files.length === 0) {
    return [];
  }

  if (!patterns || patterns.length === 0) {
    return [];
  }

  const defaultOptions = {
    dot: true,
    nocase: false,
    matchBase: true,
    ...options
  };

  return micromatch(files, patterns, defaultOptions);
}

/**
 * Normalizes file paths for consistent matching
 * @param {string} filePath - File path to normalize
 * @returns {string} Normalized file path
 *
 * @example
 * normalizeFilePath('./src/index.js'); // 'src/index.js'
 * normalizeFilePath('src\\index.js'); // 'src/index.js'
 */
export function normalizeFilePath(filePath) {
  if (!filePath) return '';

  return filePath
    .replace(/\\/g, '/')      // Convert backslashes to forward slashes
    .replace(/^\.\//, '')     // Remove leading ./
    .replace(/\/\//g, '/');   // Remove double slashes
}

/**
 * Normalizes an array of file paths
 * @param {string[]} files - Array of file paths
 * @returns {string[]} Array of normalized file paths
 */
export function normalizeFilePaths(files) {
  if (!files || !Array.isArray(files)) {
    return [];
  }

  return files.map(normalizeFilePath);
}

/**
 * Validates glob patterns to ensure they're properly formatted
 * @param {string[]} patterns - Array of glob patterns to validate
 * @returns {Object} Validation result with valid and invalid patterns
 *
 * @example
 * validatePatterns(['*.js', '**\/invalid\/', 'valid/**']);
 * // Returns: { valid: ['*.js', 'valid/**'], invalid: ['**\/invalid\/'] }
 */
export function validatePatterns(patterns) {
  if (!patterns || !Array.isArray(patterns)) {
    return { valid: [], invalid: [] };
  }

  const valid = [];
  const invalid = [];

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
  all: function() {
    return Object.values(this)
      .filter(v => Array.isArray(v))
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
