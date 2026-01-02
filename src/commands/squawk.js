import MarkdownRenderer from '../lib/renderer.js';
import i18n from '../services/i18n.js';
import chalk from 'chalk';
import { filterByGlob, matchesAnyPattern } from '../utils/glob.js';
import TransientProgress from '../utils/transient-progress.js';
import { select } from '@inquirer/prompts';
import logUpdate from 'log-update';

/**
 * Calculates commit timestamps distributed across a date range
 * @param {Array<Object>} ungroupedChanges - Array of individual file changes
 * @param {Array<Object>} groups - Array of grouped files
 * @param {Object} options - Date options
 * @returns {Array<Date>} Array of timestamps for each commit
 */
function calculateCommitTimestamps(ungroupedChanges, groups, options) {
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
  const allItems = [...groups, ...ungroupedChanges];
  const totalCommits = allItems.length;

  if (totalCommits === 0) {
    return [];
  }

  // Calculate complexity for each item (based on lines changed)
  const itemsWithComplexity = allItems.map((item, index) => {
    let linesChanged = 0;

    if (item.files) {
      // This is a group
      linesChanged = item.files.reduce((sum, file) => {
        return sum + (file.added || 0) + (file.deleted || 0);
      }, 0);
    } else {
      // This is an individual file
      linesChanged = (item.added || 0) + (item.deleted || 0);
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
  const timestamps = new Array(totalCommits);
  let currentDate = new Date(startDate);

  // Minimum time between commits (5 minutes)
  const minTimeBetweenCommits = 5 * 60 * 1000;

  itemsWithComplexity.forEach((item, sequenceIndex) => {
    // Skip to next working time if needed
    currentDate = skipToNextWorkingTime(currentDate, excludeWeekends, endDate);

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
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {boolean} excludeWeekends - Whether to exclude weekends
 * @returns {number} Total working time in milliseconds
 */
function calculateAvailableWorkingTime(startDate, endDate, excludeWeekends) {
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
 * @param {Date} date - Current date
 * @param {boolean} excludeWeekends - Whether to exclude weekends
 * @param {Date} endDate - End boundary
 * @returns {Date} Next valid working time
 */
function skipToNextWorkingTime(date, excludeWeekends, endDate) {
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
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Object} options - Command options
 * @param {string[]} options.ignore - Glob patterns for files to ignore
 * @param {string} options.from - Start date for commit timestamps (YYYY-MM-DD)
 * @param {string} options.to - End date for commit timestamps (YYYY-MM-DD)
 * @param {string} options.timezone - Timezone for dates (e.g., 'America/New_York', default: system timezone)
 * @param {boolean} options.excludeWeekends - Whether to exclude weekends from date distribution
 * @returns {Promise<void>}
 */
export async function squawk(repo, provider, options = {}) {
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
    console.error(i18n.t('output.prefixes.error'), error.message);
    throw error;
  }
}

/**
 * Applies ignore patterns to filter out unwanted files
 * @param {Array<Object>} changes - Array of change objects from git status
 * @param {string[]} ignorePatterns - Glob patterns to filter
 * @returns {Array<Object>} Filtered changes
 */
function applyIgnorePatterns(changes, ignorePatterns) {
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
 * @param {Array<Object>} changes - Array of change objects from git status
 * @param {string[]} groupPatterns - Glob patterns for grouping
 * @returns {Object} Object with groups array and ungroupedChanges array
 */
function applyGroupPatterns(changes, groupPatterns) {
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
  constructor() {
    this.completed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.startTime = Date.now();
  }

  incrementCompleted() {
    this.completed++;
  }

  incrementFailed() {
    this.failed++;
  }

  incrementSkipped() {
    this.skipped++;
  }

  getElapsed() {
    return ((Date.now() - this.startTime) / 1000).toFixed(1);
  }
}

/**
 * Shows the squawk command title with progress bar style
 */
function showSquawkTitle() {
  console.log();
  console.log(chalk.cyan.bold('🦜 Squawk - Committing Files Individually'));
  const separator = '━'.repeat(Math.min(process.stdout.columns - 2 || 78, 80));
  console.log(chalk.dim(separator));
  console.log();
}

/**
 * Processes each file sequentially: stage, generate message, commit
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Array<Object>} changes - Array of changes to process
 * @param {Array<Object>} groups - Array of grouped files
 * @param {Array<Date>} timestamps - Array of timestamps for each commit (optional)
 * @returns {Promise<Object>} Statistics about commits
 */
async function processFilesSequentially(repo, provider, changes, groups, timestamps = null) {
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
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Array<Object>} groups - Array of grouped files
 * @param {number} totalIndividual - Number of individual files
 * @param {Array<Date>} timestamps - Array of timestamps for each commit (optional)
 * @param {TransientProgress} transientProgress - Transient progress instance
 * @param {SquawkStats} stats - Stats tracker instance
 * @returns {Promise<Object>} Statistics about group commits
 */
async function processGroups(repo, provider, groups, totalIndividual, timestamps = null, transientProgress = null, stats = null) {
  for (let j = 0; j < groups.length; j++) {
    const group = groups[j];
    const timestamp = timestamps ? timestamps[j] : null;

    // Skip empty groups
    if (group.files.length === 0) continue;

    const result = await processGroupCommit(repo, provider, group, timestamp, transientProgress);

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
 * Processes a group commit with new UI flow
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Object} group - Group object containing files
 * @param {Date} timestamp - Optional timestamp for the commit
 * @param {TransientProgress} transientProgress - Transient progress instance
 * @returns {Promise<string>} Result status: 'committed', 'skipped', or 'failed'
 */
async function processGroupCommit(repo, provider, group, timestamp = null, transientProgress = null) {
  try {
    // Stage the files
    await stageFiles(repo, group.files);

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
      await commitFile(repo, group.files, commitMessage, timestamp);
      return 'committed';
    } else if (action === 'skip') {
      return 'skipped';
    } else if (action === 'retry') {
      // Recursive retry
      return await processGroupCommit(repo, provider, group, timestamp, transientProgress);
    }
  } catch (error) {
    if (transientProgress) {
      transientProgress.clearTransient();
    }
    logFileError(group.pattern, error.message);
    return 'failed';
  }
}

/**
 * Processes a single file: stages, generates commit message, and commits
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Object} change - Change object containing file info
 * @param {Date} timestamp - Optional timestamp for the commit
 * @param {TransientProgress} transientProgress - Transient progress instance
 * @returns {Promise<string>} Result status: 'committed', 'skipped', or 'failed'
 */
async function processSingleFile(repo, provider, change, timestamp = null, transientProgress = null) {
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
  } catch (error) {
    if (transientProgress) {
      transientProgress.clearTransient();
    }
    logFileError(change.value, error.message);
    return 'failed';
  }
}

/**
 * Logs file errors (stored for later display)
 */
const fileErrors = [];

function logFileError(filename, error) {
  fileErrors.push({ filename, error });
}

/**
 * Stages files silently
 * @param {Object} repo - Git repository instance
 * @param {Array[]} files - Files to stage
 */
async function stageFiles(repo, files) {
  await repo.add(files);
  //console.log('add')
}

/**
 * Generates a commit message for staged changes silently
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @returns {Promise<string>} Generated commit message
 */
async function generateCommitMessage(repo, provider) {
  const context = repo.diff([], { staged: true });
  const commitMessage = await provider.generateCommitMessage(context);
  return commitMessage;
}

/**
 * Commits files with the given message silently
 * @param {Object} repo - Git repository instance
 * @param {Array} files - Files being committed
 * @param {string} message - Commit message
 * @param {Date} timestamp - Optional timestamp for the commit
 */
async function commitFile(repo, files, message, timestamp = null) {
  if (timestamp) {
    await repo.commit(message, { date: timestamp });
  } else {
    await repo.commit(message);
  }
}


/**
 * Displays a formatted summary with stats and timing
 * @param {SquawkStats} stats - Statistics tracker instance
 */
function showSquawkSummary(stats) {
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
