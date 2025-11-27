#!/usr/bin/env node

import CLI from '../src/lib/cli.js';
import gitRepository from '../src/services/git.js'
import LLMOrchestrator from '../src/services/llms.js'
import { program } from 'commander';
import chalk from 'chalk';
import { loadConfig, setupConfig } from '../src/services/config.js'
import { gitAdd } from '../src/commands/add.js'
import { gitCommit } from '../src/commands/commit.js'
import { squawk } from '../src/commands/squawk.js'
import i18n from '../src/services/i18n.js';
import { parseFlag } from '../src/utils/args-parser.js';

// Configure commander
program
  .name('coparrot')
  .description('your git assistant')
  .version('1.0.0')
  .option('-s, --single-line', 'Use single-line input instead of editor')
  .parse(process.argv);

const options = program.opts();
const config = loadConfig();

/**
 * Example: Custom command handler
 */
async function handleCommand(cmd, args, cli) {
  const repo = new gitRepository();
  const status = repo.getDetailedStatus();

  // Initialize LLM provider
  const provider = new LLMOrchestrator({
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    instructions: {
      'commit': config.commitConvention,
      'review': config.codeReviewStyle,
      'pr': config.prMessageStyle,
      'custom': config.customInstructions
    },
    skipApproval: args.includes('-y') || args.includes('--yes')
  });

  switch (cmd) {
    case 'test':
      cli.streamer.showSuccess('Test command executed successfully!');
      break;

    case 'demo':
      cli.streamer.showInfo('Running demo...');
      await cli.simulateStreaming(
        'This is a demonstration of the streaming output feature. ' +
        'Text appears word by word, creating a natural conversation flow. ' +
        'You can customize the speed and behavior as needed.',
        30
      );
      break;
    case 'status':
      cli.streamer.showGitInfo(status)
      break;
    case 'add':
      gitAdd(repo, status) 
      break;
    case 'commit':
      const context = repo.diff([], {staged: true});

      if (!context) {
        cli.streamer.showWarning(i18n.t('git.commit.noFilesStaged'));
        cli.streamer.showInfo(i18n.t('git.commit.useAddFirst'));
        return
      }

      const commitMessage = await provider.generateCommitMessage(context);
      //const commitMessage = "test"

      if (commitMessage) {
        gitCommit(repo, commitMessage)
      }
      break;
    case 'squawk':
      const ignoredFiles = parseFlag(args, '--ignore');
      await squawk(repo, provider, { ignore: ignoredFiles });
      break;
    default:
      cli.streamer.showError(`Unknown command: /${cmd}`);
      cli.streamer.showInfo('Available custom commands: /test, /demo');
  }
}

/**
 * Start the CLI
 */
async function main() {
  // Initialize i18n with the configured language
  // loadConfig already initializes i18n, but this ensures it's always called
  const language = config.language || 'en';
  i18n.initialize(language);

  const cli = new CLI({
    appName: 'CoParrot',
    version: '1.0.0',
    multiline: !options.singleLine,
    onCommand: handleCommand,
    customCommands: {
      'status': 'Show repository status with changed files',
      'add': 'Interactively stage files for commit',
      'commit': 'Commit staged files with AI-generated message',
      'squawk': 'Commit each changed file individually (use --ignore to exclude files)'
    },
    config: config
  });

  if (!config.provider) {
    const isSetupFinished = await setupConfig();

    if (isSetupFinished) cli.start();
  }

  await cli.start();
}

// Run the application
main().catch(error => {
  console.error(chalk.red.bold('\nFatal Error:'), error);
  process.exit(1);
});
