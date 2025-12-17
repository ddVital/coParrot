import chalk from 'chalk';
import ora from 'ora';
import { createHeader, displayStaticHeader } from '../utils/header.js';
import { getRepoStats } from '../utils/repo-stats.js';
import i18n from '../services/i18n.js';
import TransientProgress from '../utils/transient-progress.js';

/**
 * Handles streaming output with elegant formatting
 */
class StreamingOutput {
  constructor(renderer) {
    this.renderer = renderer;
    this.currentSpinner = null;
    this.buffer = '';
    this.transientProgress = new TransientProgress();
  }

  /**
   * Start streaming text output
   */
  startStream() {
    this.buffer = '';
  }

  /**
   * Add chunk to stream
   */
  addChunk(chunk) {
    this.buffer += chunk;
    // Stream word by word for natural feel
    process.stdout.write(chunk);
  }

  /**
   * End the current stream
   */
  endStream() {
    if (this.buffer) {
      process.stdout.write('\n\n');
      this.buffer = '';
    }
  }

  /**
   * Show a thinking indicator
   */
  startThinking(message = null) {
    if (this.currentSpinner) {
      this.currentSpinner.stop();
    }

    const defaultMessage = message || i18n.t('cli.thinking');
    this.currentSpinner = ora({
      text: chalk.dim(defaultMessage),
      color: 'cyan',
      spinner: 'dots'
    }).start();
  }

  /**
   * Stop thinking indicator
   */
  stopThinking() {
    if (this.currentSpinner) {
      this.currentSpinner.stop();
      this.currentSpinner = null;
    }
  }

  /**
   * Update thinking message
   */
  updateThinking(message) {
    if (this.currentSpinner) {
      this.currentSpinner.text = chalk.dim(message);
    }
  }

  /**
   * Show tool execution
   */
  showToolExecution(toolName, description) {
    this.stopThinking();
    process.stdout.write(this.renderer.renderToolUse(toolName, description));

    this.startThinking(i18n.t('output.running', { toolName }));
  }

  /**
   * Show tool result
   */
  showToolResult(toolName, success = true) {
    this.stopThinking();
    process.stdout.write(this.renderer.renderToolResult(toolName, success));
  }

  /**
   * Display error message
   */
  showError(error) {
    this.stopThinking();
    console.error('\n' + chalk.rgb(239, 68, 68).bold('✗ ' + i18n.t('output.prefixes.error') + ' ') + chalk.white(error.message || error));
    console.error(chalk.rgb(239, 68, 68)('▓'.repeat(process.stdout.columns || 80)));
  }

  /**
   * Display success message
   */
  showSuccess(message) {
    this.stopThinking();
    console.log('\n' + chalk.rgb(34, 197, 94).bold('✓ ' + i18n.t('output.prefixes.success') + ' ') + chalk.white(message));
  }

  /**
   * Display info message
   */
  showInfo(message) {
    this.stopThinking();
    console.log('\n' + chalk.rgb(6, 182, 212).bold('ℹ ' + i18n.t('output.prefixes.info') + ' ') + chalk.white(message));
  }

  showGitInfo(context) {
    this.stopThinking();
    context.map(change => {
      // Translate status
      const translatedStatus = i18n.t(`git.status.${change.status}`);

      // Color based on status type
      let statusColor = chalk.white;
      if (change.status.includes('staged')) {
        statusColor = chalk.green;
      } else if (change.status === 'modified') {
        statusColor = chalk.yellow;
      } else if (change.status === 'deleted') {
        statusColor = chalk.red;
      } else if (change.status === 'untracked') {
        statusColor = chalk.cyan;
      } else if (change.status === 'conflict') {
        statusColor = chalk.red.bold;
      }

      // Format status with color and padding
      const formattedStatus = statusColor(translatedStatus.padEnd(25));

      // Build stats string
      const stats = [];
      if (change.additions > 0) stats.push(chalk.green(`+${change.additions}`));
      if (change.deletions > 0) stats.push(chalk.red(`-${change.deletions}`));
      const statsStr = stats.length > 0 ? ' ' + stats.join(' ') : '';

      console.log(`${formattedStatus} ${chalk.dim(change.value)}${statsStr}`);
    })
  }

  /**
   * Display warning message
   */
  showWarning(message) {
    this.stopThinking();
    console.log('\n' + chalk.rgb(234, 179, 8).bold('⚠ ' + i18n.t('output.prefixes.warning') + ' ') + chalk.white(message));
  }

  /**
   * Display a separator
   */
  showSeparator() {
    const width = process.stdout.columns || 80;
    console.log(chalk.rgb(100, 116, 139)('─'.repeat(width)));
  }

  /**
   * Clear the console
   */
  clear() {
    console.clear();
  }

  /**
   * Display a pixel-art style border
   */
  showPixelBorder() {
    const width = process.stdout.columns || 80;
    console.log(chalk.rgb(34, 197, 94)('▓'.repeat(width)));
  }

  /**
   * Display welcome banner with gradient header and static parrot
   */
  async showWelcome(appName = 'CoParrot', version = '1.0.1', config = {}) {
    this.clear();
    console.log();

    // Display static parrot header with mascot in bordered box
    await displayStaticHeader(appName, version);

    // Descriptive tagline
    const providerName = config.provider ? config.provider.toUpperCase() : 'not configured';
    const providerColor = config.provider ? chalk.rgb(34, 197, 94) : chalk.rgb(239, 68, 68);

    console.log(chalk.dim(` ${appName} can write, analyze and enhance your git workflow right from your terminal.`));
    console.log(chalk.dim(` LLM Provider: `) + providerColor(providerName) + chalk.dim(`. ${appName} uses AI, check for mistakes.`));
    console.log();

    // Show helpful info for first-time users
    if (!config.provider) {
      console.log(chalk.rgb(234, 179, 8)(' ⚡ ' + i18n.t('app.welcome.firstTime')));
      console.log();
    } else {
      // Quick command hints
      console.log(chalk.dim(' Type ') + chalk.cyan('help') + chalk.dim(' for commands, ') + chalk.cyan('status') + chalk.dim(' to view changes, or ') + chalk.cyan('?') + chalk.dim(' for quick help.'));
      console.log();
    }
  }

  /**
   * Start a transient progress operation (disappears when done)
   * @param {string} message - Initial message to display
   * @returns {Object} - Operation controller with update, complete, error methods
   */
  startTransientOperation(message) {
    this.stopThinking(); // Stop any existing spinner
    return this.transientProgress.createOperation(message);
  }

  /**
   * Start a generating operation with shimmer effect (for AI content generation)
   * @param {string} message - Initial message to display
   * @returns {Object} - Operation controller with shimmer effects
   */
  startGeneratingOperation(message) {
    this.stopThinking(); // Stop any existing spinner
    return this.transientProgress.createGeneratingOperation(message);
  }

  /**
   * Show a simple transient message (for quick status updates)
   * @param {string} message - Message to display
   * @param {string} status - 'running', 'success', 'error'
   */
  showTransientMessage(message, status = 'running') {
    this.stopThinking();
    this.transientProgress.showTransient(message, status);
  }

  /**
   * Clear all transient messages
   */
  clearTransient() {
    this.transientProgress.clearTransient();
  }
}

export default StreamingOutput;
