#!/usr/bin/env node

import CLI from '../src/lib/cli.js';
import gitRepository from '../src/services/git.js'
import LLMOrchestrator from '../src/services/llms.js'
import { program } from 'commander';
import chalk from 'chalk';
import { loadConfig, setupConfig } from '../src/services/config.js'
import { setupStep } from '../src/commands/setup.js'
import { gitAdd } from '../src/commands/add.js'
import { gitCommit } from '../src/commands/commit.js'
import { gitCheckout } from '../src/commands/checkout.js'
import { squawk } from '../src/commands/squawk.js'
import { hookCommand } from '../src/commands/hook.js'
import i18n from '../src/services/i18n.js';
import { parseFlag } from '../src/utils/args-parser.js';
import { VERSION } from '../src/utils/index.js';
import State from '../src/services/state.js'
import logUpdate from 'log-update';
import { detectPRTemplate } from '../src/commands/setup.js'
import { handlePrCommand } from '../src/commands/pr.js'

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
 * Example: Custom command handler
 */
async function handleCommand(cmd, args, cli) {
  const repo = new gitRepository();
  const status = repo.getDetailedStatus();
  const state = new State();
  // Initialize LLM provider
  const provider = new LLMOrchestrator({
    provider: config.provider,
    apiKey: config.apiKey,
    ollamaUrl: config.ollamaUrl,
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
    case 'status':
      cli.streamer.showGitInfo(status)
      break;
    case 'add':
      await gitAdd(repo, status) 
      break;
    case 'commit':
      const context = repo.diff([], { staged: true, compact: true });

      if (!context) {
        cli.streamer.showWarning(i18n.t('git.commit.noFilesStaged'));
        cli.streamer.showInfo(i18n.t('git.commit.useAddFirst'));
        return
      }

      let commitMessage;

      // Check for verbose flag override
      const verboseOverride = args.includes('--verbose') || args.includes('-v');
      if (verboseOverride) {
        provider.options.instructions.commitConvention.verboseCommits = true;
      }

      // If --hook flag is passed, use direct generation (no UI/approval)
      if (args.includes('--hook')) {
        commitMessage = await provider.generateCommitMessageDirect(context);
        // Output only the message for git hook
        console.log(commitMessage);
      } else {
        commitMessage = await provider.generateCommitMessage(context);
        gitCommit(repo, commitMessage)
      }

      break;
    case 'squawk':
      const ignoredFiles = parseFlag(args, '--ignore');
      const groupedFiles = parseFlag(args, '--group');
      const fromDate = parseFlag(args, '--from')[0] || null;
      const toDate = parseFlag(args, '--to')[0] || null;
      const timezone = parseFlag(args, '--timezone')[0] || null;
      const excludeWeekends = args.includes('--exclude-weekends');

      await squawk(repo, provider, {
        ignore: ignoredFiles,
        group: groupedFiles,
        from: fromDate,
        to: toDate,
        timezone: timezone,
        excludeWeekends: excludeWeekends
      });
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
    case 'pr':
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
async function main() {
  // Check if a command was passed as argument (e.g., coparrot status)
  // Do this BEFORE parsing commander to avoid conflicts
  const rawArgs = process.argv.slice(2);
  const validCommands = ['status', 'add', 'commit', 'squawk', 'checkout', 'setup', 'demo', 'test', 'hook', 'pr'];
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

  const cli = new CLI({
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
      'pr': "Generate PR message"
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
