import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { displayWelcomeBanner } from '../utils/welcome-banner.js';
import i18n from '../services/i18n.js';
import TransientProgress from '../utils/transient-progress.js';

interface GitChange {
  status: string;
  value: string;
  additions?: number;
  deletions?: number;
}

interface AppConfig {
  provider?: string;
  [key: string]: any;
}

/**
 * Handles streaming output with elegant formatting
 */
class StreamingOutput {
  renderer: any; // TODO: type when renderer.ts is migrated
  currentSpinner: Ora | null;
  buffer: string;
  transientProgress: any; // TODO: type when transient-progress.ts is migrated

  constructor(renderer: any) {
    this.renderer = renderer;
    this.currentSpinner = null;
    this.buffer = '';
    this.transientProgress = new TransientProgress();
  }

  /**
   * Start streaming text output
   */
  startStream(): void {
    this.buffer = '';
  }

  /**
   * Add chunk to stream
   */
  addChunk(chunk: string): void {
    this.buffer += chunk;
    // Stream word by word for natural feel
    process.stdout.write(chunk);
  }

  /**
   * End the current stream
   */
  endStream(): void {
    if (this.buffer) {
      process.stdout.write('\n\n');
      this.buffer = '';
    }
  }

  /**
   * Show a thinking indicator
   */
  startThinking(message: string | null = null): void {
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
  stopThinking(): void {
    if (this.currentSpinner) {
      this.currentSpinner.stop();
      this.currentSpinner = null;
    }
  }

  /**
   * Update thinking message
   */
  updateThinking(message: string): void {
    if (this.currentSpinner) {
      this.currentSpinner.text = chalk.dim(message);
    }
  }

  /**
   * Show tool execution
   */
  showToolExecution(toolName: string, description: string): void {
    this.stopThinking();
    process.stdout.write(this.renderer.renderToolUse(toolName, description));

    this.startThinking(i18n.t('output.running', { toolName }));
  }

  /**
   * Show tool result
   */
  showToolResult(toolName: string, success = true): void {
    this.stopThinking();
    process.stdout.write(this.renderer.renderToolResult(toolName, success));
  }

  /**
   * Display error message
   */
  showError(error: string | { message?: string }): void {
    this.stopThinking();
    const msg = typeof error === 'string' ? error : (error.message || String(error));
    console.error('\n' + chalk.rgb(239, 68, 68).bold('✗ ' + i18n.t('output.prefixes.error') + ' ') + chalk.white(msg));
  }

  /**
   * Display success message
   */
  showSuccess(message: string): void {
    this.stopThinking();
    console.log('\n' + chalk.rgb(34, 197, 94).bold('✓ ' + i18n.t('output.prefixes.success') + ' ') + chalk.white(message));
  }

  /**
   * Display info message
   */
  showInfo(message: string): void {
    this.stopThinking();
    console.log('\n' + chalk.rgb(6, 182, 212).bold('ℹ ' + i18n.t('output.prefixes.info') + ' ') + chalk.white(message));
  }

  showGitInfo(context: GitChange[]): void {
    this.stopThinking();
    context.map((change: GitChange) => {
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
      const stats: string[] = [];
      if (change.additions && change.additions > 0) stats.push(chalk.green(`+${change.additions}`));
      if (change.deletions && change.deletions > 0) stats.push(chalk.red(`-${change.deletions}`));
      const statsStr = stats.length > 0 ? ' ' + stats.join(' ') : '';

      console.log(`${formattedStatus} ${chalk.dim(change.value)}${statsStr}`);
    })
  }

  /**
   * Display warning message
   */
  showWarning(message: string): void {
    this.stopThinking();
    console.log('\n' + chalk.rgb(234, 179, 8).bold('⚠ ' + i18n.t('output.prefixes.warning') + ' ') + chalk.white(message));
  }

  /**
   * Display a separator
   */
  showSeparator(): void {
    const width = process.stdout.columns || 80;
    console.log(chalk.rgb(100, 116, 139)('─'.repeat(width)));
  }

  /**
   * Clear the console
   */
  clear(): void {
    console.clear();
  }

  /**
   * Display welcome banner
   */
  async showWelcome(appName = 'CoParrot', version = '1.0.1', config: AppConfig = {}): Promise<void> {
    this.clear();
    console.log();

    // Display welcome banner
    await displayWelcomeBanner(appName);

    console.log();

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
   */
  startTransientOperation(message: string): any {
    this.stopThinking();
    return this.transientProgress.createOperation(message);
  }

  /**
   * Start a generating operation with shimmer effect (for AI content generation)
   */
  startGeneratingOperation(message: string): any {
    this.stopThinking();
    return this.transientProgress.createGeneratingOperation(message);
  }

  /**
   * Show a simple transient message (for quick status updates)
   */
  showTransientMessage(message: string, status: 'running' | 'success' | 'error' = 'running'): void {
    this.stopThinking();
    this.transientProgress.showTransient(message, status);
  }

  /**
   * Clear all transient messages
   */
  clearTransient(): void {
    this.transientProgress.clearTransient();
  }
}

export default StreamingOutput;
