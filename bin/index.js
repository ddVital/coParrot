#!/usr/bin/env node

import CLI from '../src/lib/cli.js';
import gitRepository from '../src/services/git.js'
import LLMOrchestrator from '../src/services/llms.js'
import { program } from 'commander';
import chalk from 'chalk';
import { loadConfig, setupConfig } from '../src/services/config.js'
import { gitAdd } from '../src/commands/add.js'
import i18n from '../src/services/i18n.js';

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
    }
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
      // TODO: noticed that when I run the first time setup and try to run this it apparently is not being able to get the provider (toLowerCase() error)
      const context = repo.diff([], {staged: true});
      // provider.generateCommitMessage(context);
      provider.generateCommitMessage(context, 'commit');
      // gitCommit(repo, status, provider)
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
      'test': 'Run a test command',
      'demo': 'Show a streaming demo'
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
