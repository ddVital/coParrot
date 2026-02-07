import i18n from '../services/i18n.js';
import chalk from 'chalk';
import { filterByGlob, matchesAnyPattern } from '../utils/glob.js';
import TransientProgress from '../utils/transient-progress.js';
import { select, confirm, input } from '@inquirer/prompts';
import { parseFlag, hasFlag } from '../utils/args-parser.js';
import { isWindows } from '../utils/platform.js';
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
  skipApproval?: boolean;
}

interface ItemWithComplexity {
  index: number;
  linesChanged: number;
}

interface FileError {
  filename: string;
  error: string;
}

interface ProcessContext {
  repo: GitRepository;
  provider: LLMOrchestrator;
  progress: TransientProgress;
  stats: SquawkStats;
  skipApproval: boolean;
  totalItems: number;
  lastCommitMessage: string;
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
    startDate = new Date(from);
  } else {
    startDate = new Date(from + 'T09:00:00');
  }

  if (to.includes('T')) {
    endDate = new Date(to);
  } else {
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
      linesChanged = item.files.reduce((sum: number, file: GitChange) => {
        return sum + (file.added || 0) + (file.deleted || 0);
      }, 0);
    } else {
      const change = item as GitChange;
      linesChanged = (change.added || 0) + (change.deleted || 0);
    }

    return {
      index,
      linesChanged: Math.max(linesChanged, 1)
    };
  });

  itemsWithComplexity.sort((a, b) => b.linesChanged - a.linesChanged);

  const totalComplexity = itemsWithComplexity.reduce((sum, item) => sum + item.linesChanged, 0);
  const availableTime = calculateAvailableWorkingTime(startDate, endDate, excludeWeekends);

  if (availableTime === 0) {
    console.log(chalk.yellow('No working time in date range. Using current time for commits.'));
    return null;
  }

  const timestamps: Date[] = new Array(totalCommits);
  let currentDate: Date | null = new Date(startDate);
  const minTimeBetweenCommits = 5 * 60 * 1000;

  itemsWithComplexity.forEach((item, sequenceIndex) => {
    if (currentDate) {
      currentDate = skipToNextWorkingTime(currentDate, excludeWeekends, endDate);
    }

    if (!currentDate || currentDate > endDate) {
      currentDate = new Date(endDate);
    }

    const randomSeconds = Math.floor(Math.random() * 60);
    const randomMinutes = Math.floor(Math.random() * 60);
    currentDate.setMinutes(randomMinutes);
    currentDate.setSeconds(randomSeconds);

    timestamps[item.index] = new Date(currentDate);

    const timeProportion = item.linesChanged / totalComplexity;
    const baseTimeGap = availableTime * timeProportion;
    const variationFactor = 0.5 + Math.random();
    const timeGap = Math.max(minTimeBetweenCommits, baseTimeGap * variationFactor);

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
  const workDayMs = 9 * 60 * 60 * 1000;

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

  if (result > endDate) {
    return null;
  }

  while (excludeWeekends && (result.getDay() === 0 || result.getDay() === 6)) {
    result.setDate(result.getDate() + 1);
    result.setHours(9);
    result.setMinutes(0);
    result.setSeconds(0);
  }

  if (result.getHours() < 9) {
    result.setHours(9);
    result.setMinutes(0);
    result.setSeconds(0);
  }

  if (result.getHours() >= 18) {
    result.setDate(result.getDate() + 1);
    result.setHours(9);
    result.setMinutes(0);
    result.setSeconds(0);

    if (excludeWeekends) {
      return skipToNextWorkingTime(result, excludeWeekends, endDate);
    }
  }

  return result;
}

/**
 * Prompts for interactive configuration when --interactive/-i is set.
 * Skips prompts for options already provided by flags.
 */
async function promptInteractiveOptions(options: SquawkOptions): Promise<SquawkOptions> {
  const result = { ...options };

  if (!result.ignore || result.ignore.length === 0) {
    const wantsIgnore = await confirm({
      message: i18n.t('git.squawk.interactive.ignorePrompt'),
      default: false
    });

    if (wantsIgnore) {
      const patterns = await input({
        message: i18n.t('git.squawk.interactive.ignorePatterns')
      });
      if (patterns.trim()) {
        result.ignore = patterns.split(',').map(p => p.trim());
      }
    }
  }

  if (!result.group || result.group.length === 0) {
    const wantsGroup = await confirm({
      message: i18n.t('git.squawk.interactive.groupPrompt'),
      default: false
    });

    if (wantsGroup) {
      const patterns = await input({
        message: i18n.t('git.squawk.interactive.groupPatterns')
      });
      if (patterns.trim()) {
        result.group = patterns.split(',').map(p => p.trim());
      }
    }
  }

  if (!result.from && !result.to) {
    const wantsDateRange = await confirm({
      message: i18n.t('git.squawk.interactive.dateRangePrompt'),
      default: false
    });

    if (wantsDateRange) {
      const from = await input({
        message: i18n.t('git.squawk.interactive.startDate')
      });
      const to = await input({
        message: i18n.t('git.squawk.interactive.endDate')
      });

      if (from.trim()) result.from = from.trim();
      if (to.trim()) result.to = to.trim();

      if (result.from && result.to) {
        result.excludeWeekends = await confirm({
          message: i18n.t('git.squawk.interactive.excludeWeekendsPrompt'),
          default: false
        });
      }
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
  args: string[] = []
): Promise<void> {
  const ignoredFiles = parseFlag(args, '--ignore');
  const groupedFiles = parseFlag(args, '--group');
  const fromDate = parseFlag(args, '--from')[0];
  const toDate = parseFlag(args, '--to')[0];
  const timezone = parseFlag(args, '--timezone')[0];
  const excludeWeekends = hasFlag(args, '--exclude-weekends');
  const interactive = hasFlag(args, ['-i', '--interactive']);
  const skipApproval = hasFlag(args, ['-y', '--yes']);

  let options: SquawkOptions = {
    ignore: ignoredFiles.length > 0 ? ignoredFiles : undefined,
    group: groupedFiles.length > 0 ? groupedFiles : undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    timezone: timezone || undefined,
    excludeWeekends,
    skipApproval
  };

  if (interactive) {
    options = await promptInteractiveOptions(options);
  }

  try {
    const allChanges = repo.getDetailedStatus();

    if (allChanges.length === 0) {
      console.log(chalk.yellow(i18n.t('git.squawk.noChanges')));
      return;
    }

    const filteredChanges = applyIgnorePatterns(allChanges, options.ignore);
    const { groups, ungroupedChanges } = applyGroupPatterns(filteredChanges, options.group);

    if (filteredChanges.length === 0) {
      console.log(chalk.yellow(i18n.t('git.squawk.allFilesIgnored')));
      return;
    }

    const commitTimestamps = calculateCommitTimestamps(ungroupedChanges, groups, options);

    // Save cursor position before processing output (DEC sequences not supported on Windows)
    if (!isWindows) process.stdout.write('\x1b7');

    showSquawkTitle();

    const stats = await processFilesSequentially(
      repo, provider, ungroupedChanges, groups, commitTimestamps, skipApproval
    );

    // Restore cursor and clear everything from processing
    if (!isWindows) process.stdout.write('\x1b8\x1b[0J');

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

  const filePaths = changes.map(c => c.value);
  const filteredPaths = filterByGlob(filePaths, ignorePatterns);
  const filteredChanges = changes.filter(c => filteredPaths.includes(c.value));

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

  const groups = groupPatterns.map(pattern => ({
    pattern: pattern,
    files: changes.filter(c => matchesAnyPattern(c.value, [pattern]))
  })).filter(group => group.files.length > 0);

  const groupedFiles = new Set();
  groups.forEach(group => {
    group.files.forEach(file => groupedFiles.add(file.value));
  });

  const ungroupedChanges = changes.filter(c => !groupedFiles.has(c.value));

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
 * Stats tracker for squawk command
 */
class SquawkStats {
  completed: number;
  failed: number;
  skipped: number;
  startTime: number;
  committedMessages: string[];

  constructor() {
    this.completed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.startTime = Date.now();
    this.committedMessages = [];
  }

  addCommitted(message: string): void {
    this.completed++;
    this.committedMessages.push(message);
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

  getTotal(): number {
    return this.completed + this.failed + this.skipped;
  }
}

/**
 * Shows the squawk command title
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
  timestamps: Date[] | null = null,
  skipApproval: boolean = false
): Promise<SquawkStats> {
  const stats = new SquawkStats();
  const progress = new TransientProgress();
  const totalItems = groups.length + changes.length;

  const ctx: ProcessContext = {
    repo, provider, progress, stats, skipApproval, totalItems, lastCommitMessage: ''
  };

  // Process groups first
  for (let j = 0; j < groups.length; j++) {
    const group = groups[j];
    const timestamp = timestamps ? timestamps[j] : null;

    if (group.files.length === 0) continue;

    const displayName = group.pattern;
    const processed = stats.getTotal();

    const result = await processItem(
      ctx, displayName, group.files.map(f => f.value), timestamp, processed
    );

    if (result === 'failed') {
      stats.incrementFailed();
    } else if (result === 'skipped') {
      stats.incrementSkipped();
    }
  }

  // Process individual files
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const timestamp = timestamps ? timestamps[groups.length + i] : null;
    const processed = stats.getTotal();

    const result = await processItem(
      ctx, change.value, [change.value], timestamp, processed
    );

    if (result === 'failed') {
      stats.incrementFailed();
    } else if (result === 'skipped') {
      stats.incrementSkipped();
    }
  }

  return stats;
}

/**
 * Shows animated bottom progress via TransientProgress
 */
function showProgress(
  progress: TransientProgress,
  current: number,
  total: number,
  fileName: string,
  lastCommit: string
): void {
  const substeps = [
    i18n.t('git.squawk.progress.currentFile', { file: fileName })
  ];
  if (lastCommit) {
    substeps.push(i18n.t('git.squawk.progress.lastCommit', { message: lastCommit }));
  }

  progress.start();
  progress.updateStep(
    'squawk-progress',
    i18n.t('git.squawk.progress.filesProcessed', { current, total }),
    'generating',
    substeps
  );
}

/**
 * Processes a single item (file or group): stage, generate, approve, commit
 */
async function processItem(
  ctx: ProcessContext,
  displayName: string,
  files: string[],
  timestamp: Date | null,
  processedSoFar: number,
  customInstructions: string | null = null
): Promise<string> {
  const { repo, provider, progress, skipApproval, totalItems } = ctx;

  try {
    // Stage files
    await repo.add(files);

    // Show animated bottom progress during generation
    const currentNum = processedSoFar + 1;
    showProgress(progress, currentNum, totalItems, displayName, ctx.lastCommitMessage);

    // Generate commit message using provider.call() directly (no built-in UI)
    const diff = repo.diff([], { staged: true });
    const context = { diff, stagedFiles: repo.getStagedFiles() };
    const commitMessage = await provider.call(context, 'commit', customInstructions);

    // Clear animated progress
    progress.stop(false);

    if (skipApproval) {
      // Auto-approve: commit and show git output
      const output = commitFile(repo, files, commitMessage, timestamp);
      ctx.lastCommitMessage = commitMessage;
      ctx.stats.addCommitted(commitMessage);
      console.log(output);
      return 'committed';
    }

    // Show commit message for approval (transient)
    console.log();
    console.log(chalk.rgb(34, 197, 94)('> ') + chalk.white(commitMessage));
    console.log();

    // Interactive approval (prompt clears itself)
    const action = await select({
      message: i18n.t('git.squawk.approval.message'),
      choices: [
        { name: i18n.t('git.squawk.approval.approve'), value: 'approve' },
        { name: i18n.t('git.squawk.approval.skip'), value: 'skip' },
        { name: i18n.t('git.squawk.approval.retry'), value: 'retry' },
        { name: i18n.t('git.squawk.approval.retryWithInstructions'), value: 'retry_with_instructions' }
      ]
    }, {
      clearPromptOnDone: true
    });

    // Clear the transient commit message (3 lines: blank, message, blank)
    process.stdout.write('\x1b[3A\x1b[0J');

    if (action === 'approve') {
      const output = commitFile(repo, files, commitMessage, timestamp);
      ctx.lastCommitMessage = commitMessage;
      ctx.stats.addCommitted(commitMessage);
      // Show git output during processing
      console.log(output);
      return 'committed';
    } else if (action === 'skip') {
      return 'skipped';
    } else if (action === 'retry') {
      return await processItem(ctx, displayName, files, timestamp, processedSoFar);
    } else if (action === 'retry_with_instructions') {
      const instructions = await input({
        message: i18n.t('git.squawk.approval.instructionsPrompt')
      }, {
        clearPromptOnDone: true
      });
      return await processItem(ctx, displayName, files, timestamp, processedSoFar, instructions || null);
    }

    return 'skipped';
  } catch (error) {
    progress.stop(false);
    const err = error as Error;
    logFileError(displayName, err.message);
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
 * Commits files with the given message, returns git output
 */
function commitFile(
  repo: GitRepository,
  files: string[],
  message: string,
  timestamp: Date | null = null
): string {
  if (timestamp) {
    return repo.commit(message, { date: timestamp });
  } else {
    return repo.commit(message);
  }
}

/**
 * Displays a detailed summary after all processing is cleared
 */
function showSquawkSummary(stats: SquawkStats): void {
  console.log();
  console.log(chalk.cyan.bold('🦜 Squawk — Summary'));
  const separator = '━'.repeat(Math.min(process.stdout.columns - 2 || 78, 80));
  console.log(chalk.dim(separator));
  console.log();

  const total = stats.getTotal();

  if (stats.completed > 0) {
    console.log(chalk.green(`  ✓ ${stats.completed} committed`));
    stats.committedMessages.forEach(msg => {
      console.log(chalk.dim(`    ${msg}`));
    });
  }
  if (stats.skipped > 0) {
    console.log(chalk.yellow(`  ⊘ ${stats.skipped} skipped`));
  }
  if (stats.failed > 0) {
    console.log(chalk.red(`  ✗ ${stats.failed} failed`));
    if (fileErrors.length > 0) {
      fileErrors.forEach(({ filename, error }) => {
        console.log(chalk.red(`    ${filename}: ${error}`));
      });
    }
  }

  console.log();
  console.log(chalk.dim(`  ${total} files processed in ${stats.getElapsed()}s`));
  console.log();

  // Clear errors for next run
  fileErrors.length = 0;
}
