#!/usr/bin/env node

import CLIClass from '../src/lib/cli.js';
import gitRepository from '../src/services/git.js';
import LLMOrchestrator from '../src/services/llms.js';
import { program } from 'commander';
import chalk from 'chalk';
import { loadConfig, setupConfig, resolveApiKey } from '../src/services/config.js';
import { setupStep } from '../src/commands/setup.js';
import { gitAdd } from '../src/commands/add.js';
import { commitCommand } from '../src/commands/commit.js';
import { gitCheckout } from '../src/commands/checkout.js';
import { squawk } from '../src/commands/squawk.js';
import { hookCommand } from '../src/commands/hook.js';
import i18n from '../src/services/i18n.js';
import { VERSION } from '../src/utils/index.js';
import { handlePrCommand } from '../src/commands/pr.js';
import { gitStatus } from '../src/commands/status.js';
import { contextCommand } from '../src/commands/context.js';
import { loadContext } from '../src/services/context.js';
import type { GitChange } from '../src/services/git.js';

// Configure commander
program
  .name('coparrot')
  .description('your git assistant')
  .version(VERSION)
  .option('-s, --single-line', 'Use single-line input instead of editor')
  .allowUnknownOption()
  .allowExcessArguments(true);

const config = loadConfig();

/**
 * Custom command handler
 */
async function handleCommand(cmd: string, args: string[], cli: CLIClass): Promise<void> {
  const config = loadConfig(); // re-read on each command to pick up setup changes
  const repo = new gitRepository();
  const status: GitChange[] = repo.getDetailedStatus();

  // Initialize LLM provider
  const sessionCtx = loadContext();
  const provider = new LLMOrchestrator({
    provider: config.provider as 'openai' | 'claude' | 'gemini' | 'ollama' | undefined,
    apiKey: resolveApiKey(config.provider, config.apiKey) ?? undefined,
    ollamaUrl: config.ollamaUrl ?? undefined,
    model: config.model ?? undefined,
    instructions: {
      commitConvention: config.commitConvention,
      prMessageStyle: config.prMessageStyle,
      customInstructions: config.customInstructions,
      sessionContext: sessionCtx
    },
    skipApproval: args.includes('-y') || args.includes('--yes')
  });
  provider.abortSignal = cli.commandSignal;

  switch (cmd) {
    case 'test':
      cli.streamer.showSuccess('Test command executed successfully!');
      break;
    case 'status':
      gitStatus(repo, cli.streamer);
      break;
    case 'context':
      await contextCommand(args);
      break;
    case 'add':
      await gitAdd(repo, status) 
      break;
    case 'commit':
      await commitCommand(repo, provider, args, cli);
      break;
    case 'squawk':
      await squawk(repo, provider, args);
      break;
    case 'checkout':
      gitCheckout(repo, provider, args)
      break;
    case 'setup':
      // If a specific step is provided (e.g., setup language), run only that step
      if (args.length > 0) {
        await setupStep(args[0]);
      } else {
        // Run full setup wizard
        console.log();
        cli.streamer.showInfo(i18n.t('setup.reconfigureMessage'));
        console.log();
        await setupConfig();
      }
      break;
    case 'hook':
      await hookCommand(args, cli);
      break;
    case 'open-pr':
      await handlePrCommand(args, repo, provider)
      break;
    default:
      cli.streamer.showError(`Unknown command: ${cmd}`);
      cli.streamer.showInfo('Type "help" to see available commands');
  }
}

/**
 * Start the CLI
 */
async function main(): Promise<void> {
  // Check if a command was passed as argument (e.g., coparrot status)
  // Do this BEFORE parsing commander to avoid conflicts
  const rawArgs = process.argv.slice(2);
  const validCommands = ['status', 'add', 'commit', 'squawk', 'checkout', 'setup', 'demo', 'test', 'hook', 'open-pr', 'context'];
  const commandArg = rawArgs.find(arg => validCommands.includes(arg));

  // Parse commander only for options (not commands)
  const argsWithoutCommand = commandArg
    ? rawArgs.filter(arg => !validCommands.includes(arg))
    : rawArgs;

  program.parse([process.argv[0], process.argv[1], ...argsWithoutCommand]);
  const options = program.opts();

  // Initialize i18n with the configured language
  const language = config.language || 'en';
  i18n.initialize(language);

  const cli = new CLIClass({
    appName: 'CoParrot',
    version: '1.0.1',
    multiline: !options.singleLine,
    onCommand: handleCommand,
    customCommands: {
      'status': 'Show repository status with changed files',
      'add': 'Interactively stage files for commit',
      'commit': 'Commit staged files with AI-generated message (use --verbose or -v for extended description)',
      'squawk': 'Commit each file individually with realistic timestamps (--from YYYY-MM-DD[THH:MM:SS], --to, --exclude-weekends)',
      'hook': 'Manage git hooks (install/uninstall global commit message hook)',
      'setup': 'Reconfigure coParrot settings. Use "setup <step>" for specific updates (language|provider|model|convention|custom)',
      'context': 'Set project context for AI-generated messages. Use "context clear" to remove it',
      'open-pr': "Open a pull request with AI-generated title and description"
    },
    config: config
  });

  // Provide git repository class to CLI for TAB completion
  cli.setGitRepository(gitRepository);

  if (commandArg) {
    // Direct command execution - run command and exit
    const repo = new gitRepository();
    const commandIndex = rawArgs.indexOf(commandArg);
    const commandArgs = rawArgs.slice(commandIndex + 1);

    await handleCommand(commandArg, commandArgs, cli);
    process.exit(0);
  }

  // No command provided - enter interactive mode
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
