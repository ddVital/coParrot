import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import i18n from '../services/i18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the absolute path to coparrot
const COPARROT_BIN = path.resolve(__dirname, '../../bin/index.js');

/**
 * Hook management command - install/uninstall git hooks globally
 */
export async function hookCommand(args, cli) {
  const subcommand = args[0];

  switch (subcommand) {
    case 'install':
      await installHook(cli);
      break;
    case 'uninstall':
      await uninstallHook(cli);
      break;
    default:
      cli.streamer.showError(i18n.t('git.hook.unknownSubcommand', { subcommand }));
      cli.streamer.showInfo(i18n.t('git.hook.usage'));
  }
}

/**
 * Install git hook in current repository
 */
async function installHook(cli) {
  try {
    // Check if we're in a git repository
    let gitRoot;
    try {
      gitRoot = execSync('git rev-parse --git-dir', {
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();
    } catch (error) {
      cli.streamer.showError('Not a git repository. Please run this command from within a git repository.');
      return;
    }

    const hooksDir = path.join(gitRoot, 'hooks');

    // Create hooks directory if it doesn't exist
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    // Create prepare-commit-msg hook
    const hookPath = path.join(hooksDir, 'prepare-commit-msg');
    const hookContent = `#!/bin/bash
# CoParrot - AI-powered commit message generator
# This hook is called by "git commit" with the name of the file that has the
# commit message, followed by the description of the commit message's source.

COMMIT_MSG_FILE=$1
COMMIT_SOURCE=$2

# Only run if no commit message was provided (no -m, -F, etc.)
if [ -z "$COMMIT_SOURCE" ]; then
  # Check if message file is empty or contains only comments
  if ! grep -q '^[^#]' "$COMMIT_MSG_FILE" 2>/dev/null; then
    # Check if there are staged files
    if ! git diff --cached --quiet 2>/dev/null; then
      # Check if coparrot/cpt command is available
      if command -v cpt &> /dev/null; then
        COPARROT_CMD="cpt"
      elif command -v coparrot &> /dev/null; then
        COPARROT_CMD="coparrot"
      elif [ -f "${COPARROT_BIN}" ]; then
        COPARROT_CMD="node ${COPARROT_BIN}"
      else
        # CoParrot not found, skip
        exit 0
      fi

      # Generate commit message using coparrot (suppress stderr to avoid polluting output)
      GENERATED_MSG=$($COPARROT_CMD commit --hook 2>/dev/null)

      # If coparrot generated a message, prepend it to the commit message file
      if [ -n "$GENERATED_MSG" ]; then
        # Save original content (usually just comments)
        ORIGINAL_CONTENT=$(cat "$COMMIT_MSG_FILE")

        # Write generated message followed by original content
        echo "$GENERATED_MSG" > "$COMMIT_MSG_FILE"
        echo "" >> "$COMMIT_MSG_FILE"
        echo "$ORIGINAL_CONTENT" >> "$COMMIT_MSG_FILE"
      fi
    fi
  fi
fi
`;

    fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });

    // Set up git alias for squawk (if not already set)
    try {
      execSync(`git config --global alias.squawk '!node ${COPARROT_BIN} squawk'`, {
        stdio: 'pipe'
      });
    } catch (error) {
      // Ignore if already set
    }

    console.log();
    cli.streamer.showSuccess(i18n.t('git.hook.install.success'));
    console.log();
    console.log(chalk.green('  ✓ ') + chalk.white('Hook installed in this repository'));
    console.log();
    console.log(chalk.yellow('  Usage:'));
    console.log();
    console.log(chalk.cyan('    git add <files...>'));
    console.log(chalk.cyan('    git commit') + chalk.dim('         → CoParrot generates a message for you to review'));
    console.log(chalk.cyan('    git commit -m "msg"') + chalk.dim(' → Uses your message (skips CoParrot)'));
    console.log();
    console.log(chalk.dim('  The generated message will open in your editor for review.'));
    console.log(chalk.dim('  Save and close the editor to commit, or modify it as needed.'));
    console.log();
    console.log(chalk.blue('  Bonus: ') + chalk.cyan('git squawk') + chalk.dim(' → commit files individually with timestamps'));
    console.log();

  } catch (error) {
    cli.streamer.showError(i18n.t('git.hook.install.failed', { error: error.message }));
  }
}

/**
 * Uninstall git hook from current repository
 */
async function uninstallHook(cli) {
  try {
    // Check if we're in a git repository
    let gitRoot;
    try {
      gitRoot = execSync('git rev-parse --git-dir', {
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();
    } catch (error) {
      cli.streamer.showError('Not a git repository. Please run this command from within a git repository.');
      return;
    }

    const hookPath = path.join(gitRoot, 'hooks', 'prepare-commit-msg');

    // Remove hook file if it exists
    if (fs.existsSync(hookPath)) {
      fs.unlinkSync(hookPath);
      console.log();
      cli.streamer.showSuccess(i18n.t('git.hook.uninstall.success'));
      console.log();
      console.log(chalk.green('  ✓ ') + chalk.white('Hook removed from this repository'));
      console.log();
      console.log(chalk.dim('  You can now use git commit normally.'));
      console.log();
    } else {
      console.log();
      cli.streamer.showWarning('No CoParrot hook found in this repository.');
      console.log();
    }

  } catch (error) {
    cli.streamer.showError(i18n.t('git.hook.uninstall.failed', { error: error.message }));
  }
}
