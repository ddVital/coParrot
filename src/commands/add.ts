import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import i18n from '../services/i18n.js';
import type GitRepository from '../services/git.js';
import type { GitChange } from '../services/git.js';

interface PromptError extends Error {
  name: string;
}

/**
 * Prompts the user to select files to add to git staging area
 */
async function selectFilesToAdd(changes: GitChange[]): Promise<string[]> {
  try {
    return await checkbox<string>({
      message: i18n.t('git.add.selectFiles'),
      choices: changes.map(c => ({ name: c.value, value: c.value, checked: c.checked })),
      loop: false,
    }, { clearPromptOnDone: true });
  } catch (error) {
    const err = error as PromptError;
    if (err.name === 'ExitPromptError') return [];
    throw error;
  }
}

/**
 * Adds selected files to git staging area
 */
export async function gitAdd(repo: GitRepository, changes: GitChange[]): Promise<void> {
  if (changes.length === 0) {
    console.log(chalk.dim(i18n.t('git.add.noFilesAvailable')));
    console.log();
    return;
  }

  const previouslyStaged = changes.filter(c => c.checked).map(c => c.value);
  const selectedFiles = await selectFilesToAdd(changes);

  // Unstage files that were staged but are now deselected
  const toUnstage = previouslyStaged.filter(f => !selectedFiles.includes(f));
  if (toUnstage.length > 0) repo.restore(toUnstage);

  // Stage files that are newly selected
  const toStage = selectedFiles.filter(f => !previouslyStaged.includes(f));
  if (toStage.length > 0) repo.add(toStage);

  if (selectedFiles.length === 0) {
    console.log(chalk.dim(i18n.t('git.add.noFilesSelected')));
    return;
  }

  showAddedFiles(selectedFiles);
}

/**
 * Displays a compact list of staged files
 */
function showAddedFiles(files: string[]): void {
  console.log();
  files.forEach(file => {
    console.log(chalk.dim('staged  ') + chalk.white(file));
  });
  console.log();
}
