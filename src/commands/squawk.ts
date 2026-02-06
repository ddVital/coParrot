import MarkdownRenderer from '../lib/renderer.js';
import i18n from '../services/i18n.js';
import chalk from 'chalk';
import { filterByGlob, matchesAnyPattern } from '../utils/glob.js';
import TransientProgress from '../utils/transient-progress.js';
import { select } from '@inquirer/prompts';
import logUpdate from 'log-update';
import type GitRepository from '../services/git.js';
import type LLMOrchestrator from '../services/llms.js';

// Interfaces
interface GitChange {
  value: string;
  status: string;
  statusCode: string;
  checked: boolean;
  additions: number;
  deletions: number;
  added?: number;
  deleted?: number;
}

interface FileGroup {
  pattern: string;
  files: GitChange[];
  added?: number;
  deleted?: number;
}

interface DateOptions {
  from?: string;
  to?: string;
  timezone?: string;
  excludeWeekends?: boolean;
}

interface SquawkOptions extends DateOptions {
  ignore?: string[];
  group?: string[];
}

interface ItemWithComplexity {
  index: number;
  linesChanged: number;
}

interface FileError {
  filename: string;
  error: string;
}

/**
 * Calculates commit timestamps distributed across a date range
 */
function calculateCommitTimestamps(
  ungroupedChanges: GitChange[],
  groups: FileGroup[],
  options: DateOptions
): Date[] | null {
  const { from, to, timezone, excludeWeekends } = options;

  // If no date range specified, return null (commits will use current time)
  if (!from || !to) {
    return null;
  }

  // Parse dates - support both date-only (YYYY-MM-DD) and full datetime (YYYY-MM-DDTHH:MM:SS)
  let startDate, endDate;

  if (from.includes('T')) {
    // Full datetime provided
    startDate = new Date(from);
  } else {
    // Date only, default to 9 AM
    startDate = new Date(from + 'T09:00:00');
  }

  if (to.includes('T')) {
    // Full datetime provided
    endDate = new Date(to);
  } else {
    // Date only, default to 6 PM
    endDate = new Date(to + 'T18:00:00');
  }

  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.log(chalk.yellow('Invalid date format. Use YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS. Using current time for commits.'));
    return null;
  }

  if (startDate > endDate) {
    console.log(chalk.yellow('Start date must be before end date. Using current time for commits.'));
    return null;
  }

  // Combine all items (groups first, then individual files)
  const allItems: (FileGroup | GitChange)[] = [...groups, ...ungroupedChanges];
  const totalCommits = allItems.length;

  if (totalCommits === 0) {
    return [];
  }

  // Calculate complexity for each item (based on lines changed)
  const itemsWithComplexity: ItemWithComplexity[] = allItems.map((item, index) => {
    let linesChanged = 0;

    if ('files' in item && item.files) {
      // This is a group
      linesChanged = item.files.reduce((sum: number, file: GitChange) => {
        return sum + (file.added || 0) + (file.deleted || 0);
      }, 0);
    } else {
      // This is an individual file
      const change = item as GitChange;
      linesChanged = (change.added || 0) + (change.deleted || 0);
    }

    return {
      index,
      linesChanged: Math.max(linesChanged, 1) // Minimum 1 to avoid division by zero
    };
  });

  // Sort by complexity (descending - bigger changes first)
  itemsWithComplexity.sort((a, b) => b.linesChanged - a.linesChanged);

  // Calculate total complexity
  const totalComplexity = itemsWithComplexity.reduce((sum, item) => sum + item.linesChanged, 0);

  // Calculate available working time
  const availableTime = calculateAvailableWorkingTime(startDate, endDate, excludeWeekends);

  if (availableTime === 0) {
    console.log(chalk.yellow('No working time in date range. Using current time for commits.'));
    return null;
  }

  // Distribute commits across time based on complexity
  const timestamps: Date[] = new Array(totalCommits);
  let currentDate: Date | null = new Date(startDate);

  // Minimum time between commits (5 minutes)
  const minTimeBetweenCommits = 5 * 60 * 1000;

  itemsWithComplexity.forEach((item, sequenceIndex) => {
    // Skip to next working time if needed
    if (currentDate) {
      currentDate = skipToNextWorkingTime(currentDate, excludeWeekends, endDate);
    }

    if (!currentDate || currentDate > endDate) {
      // Ran out of time, use end date
      currentDate = new Date(endDate);
    }

    // Add random seconds/minutes for realism (not just exact hours)
    const randomSeconds = Math.floor(Math.random() * 60);
    const randomMinutes = Math.floor(Math.random() * 60);
    currentDate.setMinutes(randomMinutes);
    currentDate.setSeconds(randomSeconds);

    // Store timestamp at original index
    timestamps[item.index] = new Date(currentDate);

    // Calculate time to next commit based on complexity
    const timeProportion = item.linesChanged / totalComplexity;
    const baseTimeGap = availableTime * timeProportion;

    // Add variation (50-150% of base time)
    const variationFactor = 0.5 + Math.random();
    const timeGap = Math.max(minTimeBetweenCommits, baseTimeGap * variationFactor);

    // Advance to next commit time
    currentDate = new Date(currentDate.getTime() + timeGap);
  });

  return timestamps;
}

/**
 * Calculates total available working time in milliseconds
 */
function calculateAvailableWorkingTime(
  startDate: Date,
  endDate: Date,
  excludeWeekends: boolean | undefined
): number {
  let totalMs = 0;
  const current = new Date(startDate);
  const workDayMs = 9 * 60 * 60 * 1000; // 9 hours per day (9 AM - 6 PM)

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!excludeWeekends || !isWeekend) {
      totalMs += workDayMs;
    }

    current.setDate(current.getDate() + 1);
  }

  return totalMs;
}

/**
 * Skips to next working time if current time is outside working hours or on weekend
 */
function skipToNextWorkingTime(
  date: Date,
  excludeWeekends: boolean | undefined,
  endDate: Date
): Date | null {
  const result = new Date(date);

  // Check if we're past the end date
  if (result > endDate) {
    return null;
  }

  // Skip weekends if needed
  while (excludeWeekends && (result.getDay() === 0 || result.getDay() === 6)) {
    result.setDate(result.getDate() + 1);
    result.setHours(9);
    result.setMinutes(0);
    result.setSeconds(0);
  }

  // If before 9 AM, move to 9 AM
  if (result.getHours() < 9) {
    result.setHours(9);
    result.setMinutes(0);
    result.setSeconds(0);
  }

  // If after 6 PM, move to next day 9 AM
  if (result.getHours() >= 18) {
    result.setDate(result.getDate() + 1);
    result.setHours(9);
    result.setMinutes(0);
    result.setSeconds(0);

    // Recursively check if next day is also weekend
    if (excludeWeekends) {
      return skipToNextWorkingTime(result, excludeWeekends, endDate);
    }
  }

  return result;
}

/**
 * Main entry point for squawk command - commits each file individually with AI-generated messages
 */
export async function squawk(
  repo: GitRepository,
  provider: LLMOrchestrator,
  options: SquawkOptions = {}
): Promise<void> {
  const startTime = Date.now();

  try {
    const allChanges = repo.getDetailedStatus();

    if (allChanges.length === 0) {
      console.log(chalk.yellow(i18n.t('git.squawk.noChanges')));
      return;
    }

    // Apply ignore patterns first
    const filteredChanges = applyIgnorePatterns(allChanges, options.ignore);

    // Then apply group patterns
    const { groups, ungroupedChanges } = applyGroupPatterns(filteredChanges, options.group);

    if (filteredChanges.length === 0) {
      console.log(chalk.yellow(i18n.t('git.squawk.allFilesIgnored')));
      return;
    }

    // Calculate commit timestamps if date range is provided
    const commitTimestamps = calculateCommitTimestamps(
      ungroupedChanges,
      groups,
      options
    );

    // Show info about date distribution if being used
    if (commitTimestamps && commitTimestamps.length > 0) {
      const firstDate = commitTimestamps[0].toLocaleDateString();
      const lastDate = commitTimestamps[commitTimestamps.length - 1].toLocaleDateString();
      console.log(chalk.dim(`\nDistributing ${commitTimestamps.length} commits from ${firstDate} to ${lastDate}`));
      if (options.excludeWeekends) {
        console.log(chalk.dim('Excluding weekends from distribution\n'));
      }
    }

    showSquawkTitle();

    const stats = await processFilesSequentially(repo, provider, ungroupedChanges, groups, commitTimestamps);

    showSquawkSummary(stats);
  } catch (error) {
    const err = error as Error;
    console.error(i18n.t('output.prefixes.error'), err.message);
    throw error;
  }
}

/**
 * Applies ignore patterns to filter out unwanted files
 */
function applyIgnorePatterns(changes: GitChange[], ignorePatterns?: string[]): GitChange[] {
  if (!ignorePatterns || ignorePatterns.length === 0) {
    return changes;
  }

  // Extract file paths from change objects
  const filePaths = changes.map(c => c.value);

  // Filter file paths using glob patterns
  const filteredPaths = filterByGlob(filePaths, ignorePatterns);

  // Keep only changes that weren't filtered out
  const filteredChanges = changes.filter(c => filteredPaths.includes(c.value));

  // Show info about ignored files
  const ignoredCount = changes.length - filteredChanges.length;
  if (ignoredCount > 0) {
    const message = i18n.t('git.squawk.ignoringFiles', {
      count: ignoredCount,
      patterns: ignorePatterns.join(', ')
    });
    console.log(chalk.dim(message + '\n'));
  }

  return filteredChanges;
}

/**
 * Applies group patterns to organize files into groups
 */
function applyGroupPatterns(
  changes: GitChange[],
  groupPatterns?: string[]
): { groups: FileGroup[]; ungroupedChanges: GitChange[] } {
  if (!groupPatterns || groupPatterns.length === 0) {
    return { groups: [], ungroupedChanges: changes };
  }

  // Create groups for each pattern
  const groups = groupPatterns.map(pattern => ({
    pattern: pattern,
    files: changes.filter(c => matchesAnyPattern(c.value, [pattern]))
  })).filter(group => group.files.length > 0); // Remove empty groups

  // Get files that match any group pattern
  const groupedFiles = new Set();
  groups.forEach(group => {
    group.files.forEach(file => groupedFiles.add(file.value));
  });

  // Files that don't match any group pattern
  const ungroupedChanges = changes.filter(c => !groupedFiles.has(c.value));

  // Show info about grouped files
  const totalGroupedFiles = groupedFiles.size;
  if (totalGroupedFiles > 0) {
    const message = i18n.t('git.squawk.groupingFiles', {
      count: totalGroupedFiles,
      groups: groups.length,
      patterns: groupPatterns.join(', ')
    });
    console.log(chalk.dim(message + '\n'));
  }

  return { groups, ungroupedChanges };
}

/**
 * Simple stats tracker for squawk command
 */
class SquawkStats {
  completed: number;
  failed: number;
  skipped: number;
  startTime: number;

  constructor() {
    this.completed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.startTime = Date.now();
  }

  incrementCompleted(): void {
    this.completed++;
  }

  incrementFailed(): void {
    this.failed++;
  }

  incrementSkipped(): void {
    this.skipped++;
  }

  getElapsed(): string {
    return ((Date.now() - this.startTime) / 1000).toFixed(1);
  }
}

/**
 * Shows the squawk command title with progress bar style
 */
function showSquawkTitle(): void {
  console.log();
  console.log(chalk.cyan.bold('🦜 Squawk - Committing Files Individually'));
  const separator = '━'.repeat(Math.min(process.stdout.columns - 2 || 78, 80));
  console.log(chalk.dim(separator));
  console.log();
}

/**
 * Processes each file sequentially: stage, generate message, commit
 */
async function processFilesSequentially(
  repo: GitRepository,
  provider: LLMOrchestrator,
  changes: GitChange[],
  groups: FileGroup[],
  timestamps: Date[] | null = null
): Promise<SquawkStats> {
  const stats = new SquawkStats();
  const transientProgress = new TransientProgress();

  const groupStats = await processGroups(repo, provider, groups, changes.length, timestamps, transientProgress, stats);

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const timestamp = timestamps ? timestamps[groups.length + i] : null;

    const result = await processSingleFile(repo, provider, change, timestamp, transientProgress);

    if (result === 'committed') {
      stats.incrementCompleted();
    } else if (result === 'failed') {
      stats.incrementFailed();
    } else if (result === 'skipped') {
      stats.incrementSkipped();
    }
  }

  return stats;
}

/**
 * Processes grouped files
 */
async function processGroups(
  repo: GitRepository,
  provider: LLMOrchestrator,
  groups: FileGroup[],
  totalIndividual: number,
  timestamps: Date[] | null = null,
  transientProgress: TransientProgress | null = null,
  stats: SquawkStats | null = null
): Promise<SquawkStats | null> {
  for (let j = 0; j < groups.length; j++) {
    const group = groups[j];
    const timestamp = timestamps ? timestamps[j] : null;

    // Skip empty groups
    if (group.files.length === 0) continue;

    const result = await processGroupCommit(repo, provider, group, timestamp, transientProgress);

    if (result === 'committed') {
      stats?.incrementCompleted();
    } else if (result === 'failed') {
      stats?.incrementFailed();
    } else if (result === 'skipped') {
      stats?.incrementSkipped();
    }
  }

  return stats;
}

/**
 * Processes a group commit with new UI flow
 */
async function processGroupCommit(
  repo: GitRepository,
  provider: LLMOrchestrator,
  group: FileGroup,
  timestamp: Date | null = null,
  transientProgress: TransientProgress | null = null
): Promise<string> {
  try {
    // Stage the files
    await stageFiles(repo, group.files.map(f => f.value));

    // Show transient "Generating message..." indicator
    if (transientProgress) {
      transientProgress.showTransient('Generating message...', 'generating');
    }

    // Generate commit message
    const commitMessage = await generateCommitMessage(repo, provider);

    // Clear the transient message
    if (transientProgress) {
      transientProgress.clearTransient();
    }

    // Display the generated message with ">" prefix (using regular console.log before prompt)
    console.log();
    console.log(chalk.rgb(34, 197, 94)('> ') + chalk.white(commitMessage));
    console.log();

    // Show interactive approval prompt
    const action = await select({
      message: 'Approve this message?',
      choices: [
        { name: 'Yes, commit', value: 'approve' },
        { name: 'Skip this commit', value: 'skip' },
        { name: 'Retry generation', value: 'retry' }
      ]
    });

    // Clear the terminal lines for the message display after user responds
    // (inquirer already clears its prompt, so we just need to clear what we wrote)
    process.stdout.write('\x1b[3A\x1b[0J'); // Move up 3 lines and clear from cursor down

    if (action === 'approve') {
      await commitFile(repo, group.files.map(f => f.value), commitMessage, timestamp);
      return 'committed';
    } else if (action === 'skip') {
      return 'skipped';
    } else if (action === 'retry') {
      // Recursive retry
      return await processGroupCommit(repo, provider, group, timestamp, transientProgress);
    }

    return 'skipped';
  } catch (error) {
    if (transientProgress) {
      transientProgress.clearTransient();
    }
    const err = error as Error;
    logFileError(group.pattern, err.message);
    return 'failed';
  }
}

/**
 * Processes a single file: stages, generates commit message, and commits
 */
async function processSingleFile(
  repo: GitRepository,
  provider: LLMOrchestrator,
  change: GitChange,
  timestamp: Date | null = null,
  transientProgress: TransientProgress | null = null
): Promise<string> {
  try {
    // Stage the file
    await stageFiles(repo, [change.value]);

    // Show transient "Generating message..." indicator
    if (transientProgress) {
      transientProgress.showTransient('Generating message...', 'generating');
    }

    // Generate commit message
    const commitMessage = await generateCommitMessage(repo, provider);

    // Clear the transient message
    if (transientProgress) {
      transientProgress.clearTransient();
    }

    // Display the generated message with ">" prefix (using regular console.log before prompt)
    console.log();
    console.log(chalk.rgb(34, 197, 94)('> ') + chalk.white(commitMessage));
    console.log();

    // Show interactive approval prompt
    const action = await select({
      message: 'Approve this message?',
      choices: [
        { name: 'Yes, commit', value: 'approve' },
        { name: 'Skip this commit', value: 'skip' },
        { name: 'Retry generation', value: 'retry' }
      ]
    });

    // Clear the terminal lines for the message display after user responds
    // (inquirer already clears its prompt, so we just need to clear what we wrote)
    process.stdout.write('\x1b[3A\x1b[0J'); // Move up 3 lines and clear from cursor down

    if (action === 'approve') {
      await commitFile(repo, [change.value], commitMessage, timestamp);
      return 'committed';
    } else if (action === 'skip') {
      return 'skipped';
    } else if (action === 'retry') {
      // Recursive retry
      return await processSingleFile(repo, provider, change, timestamp, transientProgress);
    }

    return 'skipped';
  } catch (error) {
    if (transientProgress) {
      transientProgress.clearTransient();
    }
    const err = error as Error;
    logFileError(change.value, err.message);
    return 'failed';
  }
}

/**
 * Logs file errors (stored for later display)
 */
const fileErrors: FileError[] = [];

function logFileError(filename: string, error: string): void {
  fileErrors.push({ filename, error });
}

/**
 * Stages files silently
 */
async function stageFiles(repo: GitRepository, files: string[]): Promise<void> {
  await repo.add(files);
}

/**
 * Generates a commit message for staged changes silently
 */
async function generateCommitMessage(repo: GitRepository, provider: LLMOrchestrator): Promise<string> {
  const diff = repo.diff([], { staged: true });
  const context = { diff, stagedFiles: repo.getStagedFiles() };
  const commitMessage = await provider.generateCommitMessage(context);
  return commitMessage || '';
}

/**
 * Commits files with the given message silently
 */
async function commitFile(
  repo: GitRepository,
  files: string[],
  message: string,
  timestamp: Date | null = null
): Promise<void> {
  if (timestamp) {
    await repo.commit(message, { date: timestamp });
  } else {
    await repo.commit(message);
  }
}


/**
 * Displays a formatted summary with stats and timing
 */
function showSquawkSummary(stats: SquawkStats): void {
  console.log();
  console.log(chalk.cyan.bold('Summary'));
  console.log();

  const total = stats.completed + stats.failed + stats.skipped;

  if (stats.completed > 0) {
    console.log(chalk.green(`  ✓ ${stats.completed} committed`));
  }
  if (stats.skipped > 0) {
    console.log(chalk.yellow(`  ⊘ ${stats.skipped} skipped`));
  }
  if (stats.failed > 0) {
    console.log(chalk.red(`  ✗ ${stats.failed} failed`));

    // Show error details
    if (fileErrors.length > 0) {
      console.log();
      fileErrors.forEach(({ filename, error }) => {
        console.log(chalk.red(`    ${filename}: ${error}`));
      });
    }
  }

  const elapsed = stats.getElapsed();
  console.log();
  console.log(chalk.dim(`  Completed in ${elapsed}s`));
  console.log();

  // Clear errors for next run
  fileErrors.length = 0;
}
