import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import i18n from '../services/i18n.js';
import { saveContext } from '../services/context.js';

export async function sessionContext(): Promise<void> {
  try {
    const title = await input({
      message: i18n.t('context.titlePrompt'),
      validate: (value: string) => value.trim().length > 0 || i18n.t('context.titleRequired')
    }, {
      clearPromptOnDone: true
    });

    const description = await input({
      message: i18n.t('context.descriptionPrompt'),
      validate: (value: string) => value.trim().length > 0 || i18n.t('context.descriptionRequired')
    }, {
      clearPromptOnDone: true
    });

    saveContext({ title: title.trim(), description: description.trim() });

    console.log(chalk.green('✓ ') + i18n.t('context.saved'));
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') return;
    throw error;
  }
}
