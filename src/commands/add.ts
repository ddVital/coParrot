import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import MarkdownRenderer from '../lib/renderer.js';
import i18n from '../services/i18n.js';
import type GitRepository from '../services/git.js';
import type { GitChange } from '../services/git.js';

interface PromptError extends Error {
  name: string;
}

/**
 * Prompts the user to select files to add to git staging area
 */
export async function selectFilesToAdd(files: string[]): Promise<string[]> {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return [];
  }

  try {
    const response = await checkbox<string>({
      message: i18n.t('git.add.selectFiles'),
      choices: files.map(f => ({ name: f, value: f })),
      loop: false,
    });

    if (response.length > 0) {
      showAddedFiles(response);
    }

    return response;
  } catch (error) {
    const err = error as PromptError;
    if (err.name === 'ExitPromptError') {
      // User cancelled the prompt
      return [];
    }
    throw error;
  }
}

/**
 * Adds selected files to git staging area
 */
export async function gitAdd(repo: GitRepository, changes: GitChange[]): Promise<void> {
  if (changes.length === 0) {
    console.log(chalk.dim(i18n.t('git.add.noFilesAvailable')));
    return;
  }

  const filePaths = changes.map(c => c.value);
  const selectedFiles = await selectFilesToAdd(filePaths);

  repo.restoreAll();

  if (selectedFiles.length === 0) {
    console.log(chalk.dim(i18n.t('git.add.noFilesSelected')));
    return;
  }

  repo.add(selectedFiles);
}

/**
 * Displays a formatted list of staged files
 */
function showAddedFiles(files: string[]): void {
  const renderer = new MarkdownRenderer({
    width: process.stdout.columns || 80
  });

  const fileCount = files.length;
  const filesWord = i18n.plural('git.add.files', fileCount);

  const markdown = `## ${i18n.t('git.add.successStaged', { count: fileCount, files: filesWord })}

${files.map(file => `✓ ${file}`).join('\n')}

${i18n.t('git.add.nextStep')}`;

  const output = renderer.render(markdown);
  process.stdout.write(output);
}
