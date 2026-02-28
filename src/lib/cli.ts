import readline from 'readline';
import chalk from 'chalk';
import MarkdownRenderer from './renderer.js';
import StreamingOutput from './streamer.js';
import i18n from '../services/i18n.js';

interface CLIOptions {
  appName?: string;
  version?: string;
  prompt?: string;
  multiline?: boolean;
  onCommand?: (cmd: string, args: string[], cli: CLI) => Promise<void>;
  customCommands?: Record<string, string>;
  config?: Record<string, any>;
}

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Main CLI Interface
 */
class CLI {
  options: Required<Pick<CLIOptions, 'appName' | 'version' | 'prompt' | 'multiline'>> & CLIOptions;
  config: Record<string, any>;
  renderer: any; // TODO: type when renderer.ts is migrated
  streamer: any; // TODO: type when streamer.ts is migrated
  conversationHistory: HistoryEntry[];
  isRunning: boolean;
  lastCtrlC: number;
  private _gitRepository: any;
  private _currentBranch: string | null;
  private _commandController: AbortController | null;

  constructor(options: CLIOptions = {}) {
    this.options = {
      appName: options.appName || 'CoParrot',
      version: options.version || '1.0.0',
      prompt: options.prompt || '> ',
      multiline: options.multiline !== false,
      ...options
    };

    this.config = options.config || {};

    this.renderer = new MarkdownRenderer({
      width: process.stdout.columns || 80
    });

    this.streamer = new StreamingOutput(this.renderer);
    this.conversationHistory = [];
    this.isRunning = false;
    this.lastCtrlC = 0;
    this._gitRepository = null;
    this._currentBranch = null;
    this._commandController = null;
  }

  /**
   * Start the CLI interface
   */
  async start(): Promise<void> {
    await this.streamer.showWelcome(this.options.appName, this.options.version, this.config);
    this._currentBranch = this._detectBranch();

    this.isRunning = true;

    process.on('SIGTERM', () => this.shutdown());

    await this.mainLoop();
  }

  /**
   * Main interaction loop
   */
  async mainLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Refresh header if branch changed externally
        const branch = this._detectBranch();
        if (branch && this._currentBranch && branch !== this._currentBranch) {
          this._currentBranch = branch;
          this.streamer.clear();
          await this.streamer.showWelcome(this.options.appName, this.options.version, this.config);
        }

        const userInput = await this.getUserInput();

        if (!userInput || userInput.trim() === '') {
          continue;
        }

        // All input is treated as commands (no / prefix needed)
        await this.handleCommand(userInput);

      } catch (error) {
        const err = error as { name?: string; isTtyError?: boolean; message?: string };
        if (err.name === 'ExitPromptError' || err.name === 'AbortError') {
          // silently cancelled — return to prompt
        } else if (err.isTtyError) {
          this.streamer.showError(i18n.t('cli.messages.renderError'));
          break;
        } else {
          this.streamer.showError(err.message || String(error));
        }
      }
    }
  }

  /**
   * Get user input with TAB completion support
   */
  async getUserInput(): Promise<string> {
    return new Promise((resolve) => {
      // Create a completer function for TAB completion
      const completer = (line: string): [string[], string] => {
        return this.createCompleter(line);
      };

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: completer,
        terminal: true
      });

      // Override readline's default SIGINT behavior to implement double Ctrl+C
      rl.on('SIGINT', () => {
        const now = Date.now();
        if (now - this.lastCtrlC < 2000) {
          rl.close();
          this.shutdown();
        } else {
          console.log(chalk.dim('\n  press ctrl+c again to exit'));
          this.lastCtrlC = now;
          rl.close();
          resolve('');
        }
      });

      // Create colorful prompt
      const promptText = chalk.rgb(34, 197, 94).bold(this.options.prompt);

      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Creates smart completions based on current input
   */
  createCompleter(line: string): [string[], string] {
    const trimmedLine = line.trim();

    // File completion for squawk --ignore (check this FIRST)
    if (trimmedLine.includes('squawk') && trimmedLine.includes('--ignore')) {
      return this.completeSquawkIgnore(line);
    }

    // Command completion - match from the start
    const commands = [
      'status',
      'add',
      'commit',
      'squawk',
      'open-pr',
      'hook',
      'help',
      'clear',
      'history',
      'exit',
      'quit'
    ];

    // Check if we're at the start of input (completing command name)
    const words = trimmedLine.split(/\s+/);
    if (words.length === 1) {
      // Completing the command itself
      const hits = commands.filter(cmd => cmd.startsWith(trimmedLine));
      return [hits.length ? hits : commands, trimmedLine];
    }

    // No completions
    return [[], line];
  }

  /**
   * Completes file paths for /squawk --ignore command
   */
  completeSquawkIgnore(line: string): [string[], string] {
    try {
      // Dynamically import git repository to get changed files
      const gitRepository = this.getGitRepository();
      if (!gitRepository) {
        return [[], ''];
      }

      const repo = new gitRepository();
      const changes = repo.getDetailedStatus();
      const availableFiles: string[] = changes.map((c: { value: string }) => c.value);

      // Extract the part after the last --ignore
      const ignoreIndex = line.lastIndexOf('--ignore');
      if (ignoreIndex === -1) {
        return [[], ''];
      }

      const afterIgnore = line.substring(ignoreIndex + 8).trim();

      // Split by spaces to get individual words
      const words = afterIgnore.split(/\s+/).filter((w: string) => w.length > 0);
      const currentWord = words[words.length - 1] || '';

      // Find matching files
      const hits = availableFiles.filter((file: string) =>
        file.toLowerCase().startsWith(currentWord.toLowerCase())
      );

      // If multiple matches, show them
      if (hits.length > 1 && currentWord.length > 0) {
        console.log('\n' + chalk.dim('Matches: ' + hits.join(', ')));
      }

      // Return just the matching files and the current word being typed
      // readline will replace currentWord with the selected completion
      return [hits.length ? hits : availableFiles, currentWord];
    } catch {
      return [[], ''];
    }
  }

  /**
   * Detect current git branch
   */
  private _detectBranch(): string | null {
    const GitRepo = this.getGitRepository();
    if (!GitRepo) return null;
    try {
      const repo = new GitRepo();
      return repo.getCurrentBranch();
    } catch {
      return null;
    }
  }

  /**
   * Gets git repository class (lazy loaded to avoid circular dependency)
   */
  getGitRepository(): any {
    if (!this._gitRepository) {
      return null;
    }
    return this._gitRepository;
  }

  /**
   * Sets the git repository class for file completion
   */
  setGitRepository(gitRepoClass: any): void {
    this._gitRepository = gitRepoClass;
  }

  /**
   * Returns the AbortSignal for the currently running command, if any
   */
  get commandSignal(): AbortSignal | null {
    return this._commandController?.signal ?? null;
  }

  /**
   * Handle commands (no / prefix needed)
   */
  async handleCommand(command: string): Promise<void> {
    // Remove leading / if present (for backwards compatibility)
    const cleanCommand = command.startsWith('/') ? command.slice(1) : command;
    const [cmd, ...args] = cleanCommand.split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        this.showHelp();
        break;

      case '?':
        this.showQuickHelp();
        break;

      case 'clear':
        this.streamer.clear();
        await this.streamer.showWelcome(this.options.appName, this.options.version, this.config);
        this._currentBranch = this._detectBranch();
        break;

      case 'history':
        this.showHistory();
        break;

      case 'exit':
      case 'quit':
        await this.shutdown();
        break;

      default:
        if (this.options.onCommand) {
          this._commandController = new AbortController();
          const abortHandler = () => {
            this._commandController?.abort();
            console.log();
          };
          process.on('SIGINT', abortHandler);
          try {
            await this.options.onCommand(cmd, args, this);
          } catch (error) {
            const err = error as { name?: string; message?: string };
            const wasCancelled = this._commandController?.signal.aborted ?? false;
            if (err.name !== 'ExitPromptError' && !wasCancelled) {
              this.streamer.showError(err.message || String(error));
            }
          } finally {
            process.off('SIGINT', abortHandler);
            this._commandController = null;
          }
        } else {
          this.streamer.showError(i18n.t('cli.messages.unknownCommand', { cmd }));
          this.streamer.showInfo(i18n.t('cli.messages.helpHint'));
        }
    }
  }

  /**
   * Show quick help
   */
  showQuickHelp(): void {
    console.log();
    console.log(chalk.rgb(34, 197, 94).bold(' Quick Commands:'));
    console.log();
    console.log(chalk.dim('   status     ') + chalk.white('View repository changes'));
    console.log(chalk.dim('   add        ') + chalk.white('Interactively stage files'));
    console.log(chalk.dim('   commit     ') + chalk.white('Commit with AI-generated message'));
    console.log(chalk.dim('   help       ') + chalk.white('Show all available commands'));
    console.log();
  }

  /**
   * Show help message
   */
  showHelp(): void {
    console.log();
    console.log(chalk.rgb(6, 182, 212).bold(' Available Commands'));
    console.log();

    // Built-in commands
    console.log(chalk.rgb(34, 197, 94).bold('  System:'));
    console.log(chalk.dim(`    ${i18n.t('cli.commands.help').padEnd(12)}`) + chalk.white(`${i18n.t('cli.commandDescriptions.help')}`));
    console.log(chalk.dim(`    ${'?'.padEnd(12)}`) + chalk.white('Show quick help'));
    console.log(chalk.dim(`    ${i18n.t('cli.commands.clear').padEnd(12)}`) + chalk.white(`${i18n.t('cli.commandDescriptions.clear')}`));
    console.log(chalk.dim(`    ${i18n.t('cli.commands.history').padEnd(12)}`) + chalk.white(`${i18n.t('cli.commandDescriptions.history')}`));
    console.log(chalk.dim(`    ${i18n.t('cli.commands.exit').padEnd(12)}`) + chalk.white(`${i18n.t('cli.commandDescriptions.exit')}`));

    // Git commands
    if (this.options.customCommands) {
      console.log();
      console.log(chalk.rgb(34, 197, 94).bold('  Git Operations:'));
      for (const [cmd, description] of Object.entries(this.options.customCommands)) {
        console.log(chalk.dim(`    ${cmd.padEnd(12)}`) + chalk.white(`${description}`));
      }
    }

    console.log();
  }

  /**
   * Show conversation history
   */
  showHistory(): void {
    console.log();
    console.log(chalk.white.bold(i18n.t('cli.history.title') + ':'));
    console.log();

    if (this.conversationHistory.length === 0) {
      console.log(chalk.dim('  ' + i18n.t('cli.history.empty')));
      console.log();
      return;
    }

    this.conversationHistory.forEach((entry: HistoryEntry) => {
      const roleColor = entry.role === 'user' ? chalk.cyan : chalk.green;
      const roleLabel = entry.role === 'user' ? i18n.t('cli.history.you') : i18n.t('cli.history.assistant');

      console.log(roleColor.bold(`  ${roleLabel}:`));
      console.log(chalk.dim(`  ${entry.content.substring(0, 100)}${entry.content.length > 100 ? '...' : ''}`));
      console.log();
    });
  }

  /**
   * Shutdown the CLI gracefully
   */
  async shutdown(): Promise<void> {
    this.streamer.stopThinking();
    console.log(chalk.dim('\n  bye'));
    console.log();
    this.isRunning = false;
    process.exit(0);
  }

  /**
   * Simulate streaming response (for demonstration)
   */
  async simulateStreaming(text: string, delayMs = 20): Promise<void> {
    this.streamer.startStream();

    const words = text.split(' ');
    for (const word of words) {
      this.streamer.addChunk(word + ' ');
      await this.sleep(delayMs);
    }

    this.streamer.endStream();
  }

  /**
   * Display a response with markdown
   */
  displayResponse(markdown: string): void {
    const rendered = this.renderer.render(markdown);
    console.log(rendered);

    // Add to history
    this.conversationHistory.push({
      role: 'assistant',
      content: markdown
    });
  }

  /**
   * Display tool usage
   */
  displayToolUse(toolName: string, description: string): void {
    this.streamer.showToolExecution(toolName, description);
  }

  /**
   * Display tool result
   */
  displayToolResult(toolName: string, success = true): void {
    this.streamer.showToolResult(toolName, success);
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CLI;
