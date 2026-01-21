import { checkbox } from '@inquirer/prompts';
import MarkdownRenderer from '../lib/renderer.js';
import i18n from '../services/i18n.js';
import type GitRepository from '../services/git.js';

/**
 * Commits added files
 */
export async function gitCommit(repo: GitRepository, message: string): Promise<void> {
  try {
    const output = repo.commit(message);
    console.log(output);
  } catch (error) {
    const err = error as Error;
    console.error(i18n.t('output.prefixes.error'), err.message);
    throw error;
  }
}

