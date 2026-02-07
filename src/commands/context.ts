import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import i18n from '../services/i18n.js';
import { saveContext, clearContext, loadContext } from '../services/context.js';

async function setContext(): Promise<void> {
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

function showContext(): void {
  const ctx = loadContext();
  if (ctx) {
    console.log(chalk.bold(i18n.t('context.showTitle')) + ' ' + ctx.title);
    console.log(chalk.bold(i18n.t('context.showDescription')) + ' ' + ctx.description);
  } else {
    console.log(chalk.yellow('! ') + i18n.t('context.noContext'));
  }
}

function removeContext(): void {
  const cleared = clearContext();
  if (cleared) {
    console.log(chalk.green('✓ ') + i18n.t('context.cleared'));
  } else {
    console.log(chalk.yellow('! ') + i18n.t('context.noContext'));
  }
}

export async function contextCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'show':
      showContext();
      break;
    case 'clear':
      removeContext();
      break;
    default:
      await setContext();
  }
}
