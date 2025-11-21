import { checkbox } from '@inquirer/prompts';
import MarkdownRenderer from '../lib/renderer.js';
import i18n from '../services/i18n.js';

/**
 * Prompts the user to select files to add to git staging area
 * @param {string[]} files - Array of file paths to choose from
 * @returns {Promise<string[]>} Array of selected file paths
 * @throws {Error} If files array is invalid or empty
 */
export async function selectFilesToAdd(files) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new Error(i18n.t('git.add.noFilesAvailable'));
  }

  try {
    const response = await checkbox({
      message: i18n.t('git.add.selectFiles'),
      choices: files,
      loop: false,
    });

    if (response.length > 0) {
      showAddedFiles(response);
    }

    return response;
  } catch (error) {
    if (error.name === 'ExitPromptError') {
      // User cancelled the prompt
      return [];
    }
    throw error;
  }
}

/**
 * Adds selected files to git staging area
 * @param {Object} repo - Git repository instance
 * @param {string[]} changes - Array of changed file paths
 * @returns {Promise<void>}
 * @throws {Error} If git add operation fails
 */
export async function gitAdd(repo, changes) {
  try {
    const selectedFiles = await selectFilesToAdd(changes);

    await repo.restoreAll();

    if (selectedFiles.length === 0) {
      console.log(i18n.t('git.add.noFilesSelected'));
      return;
    }

    await repo.add(selectedFiles);
  } catch (error) {
    console.error(i18n.t('output.prefixes.error'), error.message);
    throw error;
  }
}

/**
 * Displays a formatted list of staged files
 * @param {string[]} files - Array of file paths that were staged
 * @private
 */
function showAddedFiles(files) {
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
