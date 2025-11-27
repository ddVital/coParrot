import MarkdownRenderer from '../lib/renderer.js';
import i18n from '../services/i18n.js';
import chalk from 'chalk';
import { filterByGlob } from '../utils/glob.js';

/**
 * Main entry point for squawk command - commits each file individually with AI-generated messages
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Object} options - Command options
 * @param {string[]} options.ignore - Glob patterns for files to ignore
 * @returns {Promise<void>}
 */
export async function squawk(repo, provider, options = {}) {
  try {
    const allChanges = repo.getDetailedStatus();

    if (allChanges.length === 0) {
      console.log(chalk.yellow(i18n.t('git.squawk.noChanges')));
      return;
    }

    const filteredChanges = applyIgnorePatterns(allChanges, options.ignore);
 
    if (filteredChanges.length === 0) {
      console.log(chalk.yellow('All files are ignored. Nothing to commit.'));
      return;
    }

    showSquawkTitle();

    const committedCount = await processFilesSequentially(repo, provider, filteredChanges);

    showSquawkSummary(committedCount);
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
    console.log(chalk.dim(`Ignoring ${ignoredCount} file(s) matching: ${ignorePatterns.join(', ')}\n`));
  }

  return filteredChanges;
}

/**
 * Shows the squawk command title
 */
function showSquawkTitle() {
  const renderer = new MarkdownRenderer({
    width: process.stdout.columns || 80
  });
  const titleMarkdown = `## ${i18n.t('git.squawk.title')}`;
  console.log(renderer.render(titleMarkdown));
}

/**
 * Processes each file sequentially: stage, generate message, commit
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Array<Object>} changes - Array of changes to process
 * @returns {Promise<number>} Number of successfully committed files
 */
async function processFilesSequentially(repo, provider, changes) {
  let committedCount = 0;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const current = i + 1;
    const total = changes.length;

    try {
      await processSingleFile(repo, provider, change, current, total);
      committedCount++;
    } catch (error) {
      console.error(chalk.red(`Failed to commit ${change.value}: ${error.message}`));
      // Continue with next file instead of breaking
    }
  }

  return committedCount;
}

/**
 * Processes a single file: stages, generates commit message, and commits
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @param {Object} change - Change object containing file info
 * @param {number} current - Current file index (1-based)
 * @param {number} total - Total number of files
 */
async function processSingleFile(repo, provider, change, current, total) {
  showFileProgress(change.value, current, total);

  // Stage the file
  await stageFile(repo, change.value);

  // Generate commit message
  const commitMessage = await generateCommitMessage(repo, provider);

  // Commit the file
  await commitFile(repo, change.value, commitMessage);

  showFileSuccess();
}

/**
 * Shows progress for current file
 */
function showFileProgress(filename, current, total) {
  console.log(chalk.cyan(`\n[${current}/${total}] ${i18n.t('git.squawk.processing', { current, total })}`));
  console.log(chalk.gray(`${i18n.t('git.squawk.stagingFile')} ${chalk.white(filename)}`));
}

/**
 * Stages a single file
 * @param {Object} repo - Git repository instance
 * @param {string} filename - File to stage
 */
async function stageFile(repo, filename) {
  await repo.add([filename]);
}

/**
 * Generates a commit message for staged changes
 * @param {Object} repo - Git repository instance
 * @param {Object} provider - LLM provider instance
 * @returns {Promise<string>} Generated commit message
 */
async function generateCommitMessage(repo, provider) {
  console.log(chalk.gray(i18n.t('git.squawk.generatingMessage')));

  const context = repo.diff([], { staged: true });
  const commitMessage = await provider.generateCommitMessage(context);

  return commitMessage;
}

/**
 * Commits a file with the given message
 * @param {Object} repo - Git repository instance
 * @param {string} filename - File being committed
 * @param {string} message - Commit message
 */
async function commitFile(repo, filename, message) {
  console.log(chalk.gray(`${i18n.t('git.squawk.committingFile')} ${chalk.white(filename)}`));
  await repo.commit(message);
}

/**
 * Shows success message for a committed file
 */
function showFileSuccess() {
  console.log(chalk.green(`${i18n.t('output.prefixes.success')} ${i18n.t('git.squawk.fileComplete')}`));
}

/**
 * Displays a formatted summary of committed files
 * @param {number} count - Number of files committed
 */
function showSquawkSummary(count) {
  const renderer = new MarkdownRenderer({
    width: process.stdout.columns || 80
  });

  const filesWord = i18n.plural('git.add.files', count);
  const markdown = `
## ${i18n.t('git.squawk.allComplete')}

${i18n.t('git.squawk.summary', { count, files: filesWord })}
`;

  const output = renderer.render(markdown);
  console.log(output);
}
