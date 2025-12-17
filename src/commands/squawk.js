import MarkdownRenderer from '../lib/renderer.js';
import i18n from '../services/i18n.js';
import chalk from 'chalk';
import { filterByGlob, matchesAnyPattern } from '../utils/glob.js';

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

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    showSquawkSummary(stats, elapsed);
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
 * Progress tracker for squawk command
 */
class SquawkProgress {
  constructor(total) {
    this.total = total;
    this.completed = 0;
    this.failed = 0;
    this.startTime = Date.now();
  }

  /**
   * Updates and displays the progress header
   */
  updateProgress() {
    const remaining = this.total - this.completed - this.failed;
    const percentage = Math.floor((this.completed / this.total) * 100);

    // Calculate estimated time remaining
    const elapsed = Date.now() - this.startTime;
    const avgTimePerFile = this.completed > 0 ? elapsed / this.completed : 0;
    const estimatedRemaining = avgTimePerFile * remaining;
    const estimatedSeconds = Math.ceil(estimatedRemaining / 1000);

    // Build progress bar
    const barWidth = 20;
    const filledWidth = Math.floor((this.completed / this.total) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const progressBar = chalk.green('█'.repeat(filledWidth)) + chalk.dim('░'.repeat(emptyWidth));

    // Build stats line
    const stats = [
      chalk.white(`${this.completed}/${this.total} files`),
      chalk.cyan(`${remaining} remaining`),
      this.failed > 0 ? chalk.red(`${this.failed} failed`) : null,
      estimatedSeconds > 0 && remaining > 0 ? chalk.dim(`~${estimatedSeconds}s left`) : null
    ].filter(Boolean).join(chalk.dim(' | '));

    // Clear and write progress line
    process.stdout.write('\r\x1b[K');
    process.stdout.write(`${progressBar} ${chalk.bold(`${percentage}%`)} ${chalk.dim('|')} ${stats}`);
  }

  /**
   * Marks a file as completed and updates progress
   */
  complete() {
    this.completed++;
    this.updateProgress();
  }

  /**
   * Marks a file as failed and updates progress
   */
  fail() {
    this.failed++;
    this.updateProgress();
  }

  /**
   * Finishes progress tracking
   */
  finish() {
    process.stdout.write('\n\n');
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
  const stats = {
    groupCommits: 0,
    groupFiles: 0,
    individualCommits: 0,
    totalCommits: 0,
    failed: 0
  };

  const totalItems = groups.length + changes.length;
  const progress = new SquawkProgress(totalItems);

  // Initialize progress display
  progress.updateProgress();

  const groupStats = await processGroups(repo, provider, groups, changes.length, timestamps, progress);
  stats.groupCommits = groupStats.commits;
  stats.groupFiles = groupStats.files;
  stats.failed += groupStats.failed;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const timestamp = timestamps ? timestamps[groups.length + i] : null;

    try {
      await processSingleFile(repo, provider, change, timestamp, progress);
      stats.individualCommits++;
    } catch (error) {
      progress.fail();
      logFileError(change.value, error.message);
    }
  }

  // Finish progress display
  progress.finish();

  stats.totalCommits = stats.groupCommits + stats.individualCommits;
  stats.failed = progress.failed;
  return stats;
}

/**
 * Processes grouped files
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Array<Object>} groups - Array of grouped files
 * @param {number} totalIndividual - Number of individual files
 * @param {Array<Date>} timestamps - Array of timestamps for each commit (optional)
 * @param {SquawkProgress} progress - Progress tracker instance
 * @returns {Promise<Object>} Statistics about group commits
 */
async function processGroups(repo, provider, groups, totalIndividual, timestamps = null, progress = null) {
  const stats = { commits: 0, files: 0, failed: 0 };

  for (let j = 0; j < groups.length; j++) {
    const group = groups[j];
    const timestamp = timestamps ? timestamps[j] : null;

    // Skip empty groups
    if (group.files.length === 0) continue;

    try {
      await stageFiles(repo, group.files);
      const commitMessage = await generateCommitMessage(repo, provider);
      await commitFile(repo, group.files, commitMessage, timestamp);

      stats.commits++;
      stats.files += group.files.length;
      if (progress) progress.complete();
    } catch (error) {
      stats.failed++;
      if (progress) progress.fail();
      logFileError(group.pattern, error.message);
    }
  }

  return stats;
}

/**
 * Processes a single file: stages, generates commit message, and commits
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Object} change - Change object containing file info
 * @param {Date} timestamp - Optional timestamp for the commit
 * @param {SquawkProgress} progress - Progress tracker instance
 */
async function processSingleFile(repo, provider, change, timestamp = null, progress = null) {
  await stageFiles(repo, [change.value]);
  const commitMessage = await generateCommitMessage(repo, provider);
  await commitFile(repo, [change.value], commitMessage, timestamp);

  if (progress) progress.complete();
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
  // console.log('add')
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
 * @param {Object} stats - Statistics about commits
 * @param {string} elapsed - Elapsed time in seconds
 */
function showSquawkSummary(stats, elapsed) {
  const separator = '━'.repeat(Math.min(process.stdout.columns - 2 || 78, 80));
  console.log(chalk.dim(separator));
  console.log();

  const totalFiles = stats.groupFiles + stats.individualCommits;
  const summaryText = i18n.t('git.squawk.summaryComplete', {
    count: stats.totalCommits,
    files: totalFiles
  });
  console.log(chalk.green.bold(`✨ ${summaryText}`));

  if (stats.groupCommits > 0) {
    const groupText = i18n.t('git.squawk.groupCommits', {
      count: stats.groupCommits,
      files: stats.groupFiles
    });
    console.log(chalk.dim(`   • ${groupText}`));
  }
  if (stats.individualCommits > 0) {
    const individualText = i18n.t('git.squawk.individualCommits', {
      count: stats.individualCommits
    });
    console.log(chalk.dim(`   • ${individualText}`));
  }
  if (stats.failed > 0) {
    const failedText = i18n.t('git.squawk.failedCommits', {
      count: stats.failed
    });
    console.log(chalk.red(`   • ${failedText}`));

    // Show error details
    if (fileErrors.length > 0) {
      console.log();
      console.log(chalk.red.bold('   Failed files:'));
      fileErrors.forEach(({ filename, error }) => {
        console.log(chalk.red(`     ✗ ${filename}`));
        console.log(chalk.dim(`       ${error}`));
      });
    }
  }

  const timeText = i18n.t('git.squawk.completedIn', { time: elapsed });
  console.log(chalk.dim(`\n⏱️  ${timeText}`));
  console.log();

  // Clear errors for next run
  fileErrors.length = 0;
}
