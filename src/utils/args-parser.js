/**
 * Utility functions for parsing command-line arguments
 */

/**
 * Removes surrounding quotes from a string
 * @param {string} str - String to clean
 * @returns {string} String without surrounding quotes
 */
function stripQuotes(str) {
  if (typeof str !== 'string') {
    return str;
  }

  // Remove surrounding single or double quotes
  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }

  return str;
}

/**
 * Parses flag arguments from command args array
 * @param {string[]} args - Array of command arguments
 * @param {string} flagName - Name of the flag to parse (e.g., '--ignore')
 * @returns {string[]} Array of values for the flag (with quotes stripped)
 *
 * @example
 * parseFlag(['--ignore', 'file1.txt', 'file2.txt'], '--ignore')
 * // Returns: ['file1.txt', 'file2.txt']
 *
 * @example
 * parseFlag(['--ignore', '"*.md"', '--other'], '--ignore')
 * // Returns: ['*.md']
 */
export function parseFlag(args, flagName) {
  if (!args || !Array.isArray(args) || args.length === 0) {
    return [];
  }

  const flagIndex = args.indexOf(flagName);

  if (flagIndex === -1) {
    return [];
  }

  const values = [];

  // Collect all values after the flag until we hit another flag or end of args
  for (let i = flagIndex + 1; i < args.length; i++) {
    if (args[i].startsWith('--') || args[i].startsWith('-')) {
      break;
    }
    // Strip quotes from the value
    values.push(stripQuotes(args[i]));
  }

  return values;
}

/**
 * Checks if a flag is present in args
 * @param {string[]} args - Array of command arguments
 * @param {string|string[]} flags - Flag name(s) to check
 * @returns {boolean} True if flag is present
 *
 * @example
 * hasFlag(['--ignore', 'file.txt'], '--ignore') // true
 * hasFlag(['--ignore', 'file.txt'], ['-i', '--ignore']) // true
 * hasFlag(['file.txt'], '--ignore') // false
 */
export function hasFlag(args, flags) {
  if (!args || !Array.isArray(args)) {
    return false;
  }

  const flagArray = Array.isArray(flags) ? flags : [flags];

  return flagArray.some(flag => args.includes(flag));
}

/**
 * Parses multiple flags from args
 * @param {string[]} args - Array of command arguments
 * @param {Object} flagConfig - Object mapping flag names to aliases
 * @returns {Object} Object with flag names as keys and values as arrays
 *
 * @example
 * parseFlags(['--ignore', '*.md', '-v'], {
 *   ignore: ['--ignore', '-i'],
 *   verbose: ['--verbose', '-v']
 * })
 * // Returns: { ignore: ['*.md'], verbose: [] }
 */
export function parseFlags(args, flagConfig) {
  const result = {};

  for (const [flagName, aliases] of Object.entries(flagConfig)) {
    // Find which alias (if any) is present
    const presentAlias = aliases.find(alias => args.includes(alias));

    if (presentAlias) {
      result[flagName] = parseFlag(args, presentAlias);
    } else {
      result[flagName] = [];
    }
  }

  return result;
}

/**
 * Removes flags and their values from args array
 * @param {string[]} args - Array of command arguments
 * @param {string[]} flags - Flags to remove
 * @returns {string[]} Filtered args without the specified flags
 *
 * @example
 * removeFlags(['file.txt', '--ignore', '*.md', 'other.txt'], ['--ignore'])
 * // Returns: ['file.txt', 'other.txt']
 */
export function removeFlags(args, flags) {
  if (!args || !Array.isArray(args)) {
    return [];
  }

  const result = [];
  let skipNext = false;

  for (let i = 0; i < args.length; i++) {
    if (skipNext) {
      // Skip values that were part of a flag
      if (!args[i].startsWith('--') && !args[i].startsWith('-')) {
        continue;
      }
      skipNext = false;
    }

    if (flags.includes(args[i])) {
      // This is a flag we want to remove
      skipNext = true;
      continue;
    }

    result.push(args[i]);
  }

  return result;
}

export default {
  parseFlag,
  hasFlag,
  parseFlags,
  removeFlags
};
