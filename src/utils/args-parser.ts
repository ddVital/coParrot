/**
 * Utility functions for parsing command-line arguments
 */

type FlagConfig = Record<string, string[]>;
type ParsedFlags = Record<string, string[]>;

/**
 * Removes surrounding quotes from a string
 */
function stripQuotes(str: string): string {
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
 */
export function parseFlag(args: string[], flagName: string): string[] {
  if (!args || !Array.isArray(args) || args.length === 0) {
    return [];
  }

  const flagIndex = args.indexOf(flagName);

  if (flagIndex === -1) {
    return [];
  }

  const values: string[] = [];

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
 */
export function hasFlag(args: string[], flags: string | string[]): boolean {
  if (!args || !Array.isArray(args)) {
    return false;
  }

  const flagArray = Array.isArray(flags) ? flags : [flags];

  return flagArray.some(flag => args.includes(flag));
}

/**
 * Parses multiple flags from args
 */
export function parseFlags(args: string[], flagConfig: FlagConfig): ParsedFlags {
  const result: ParsedFlags = {};

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
 */
export function removeFlags(args: string[], flags: string[]): string[] {
  if (!args || !Array.isArray(args)) {
    return [];
  }

  const result: string[] = [];
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
