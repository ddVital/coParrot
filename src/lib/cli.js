import inquirer from 'inquirer';
import readline from 'readline';
import chalk from 'chalk';
import MarkdownRenderer from './renderer.js';
import StreamingOutput from './streamer.js';
import i18n from '../services/i18n.js';

/**
 * Main CLI Interface
 */
class CLI {
  constructor(options = {}) {
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
    this.lastCtrlC = 0; // Track last Ctrl+C timestamp for double-press detection
  }

  /**
   * Start the CLI interface
   */
  async start() {
    await this.streamer.showWelcome(this.options.appName, this.options.version, this.config);

    this.isRunning = true;

    // Handle graceful shutdown with double Ctrl+C
    process.on('SIGINT', () => this.handleCtrlC());
    process.on('SIGTERM', () => this.shutdown());

    await this.mainLoop();
  }

  /**
   * Handle Ctrl+C - require double press to exit
   */
  handleCtrlC() {
    const now = Date.now();
    const timeSinceLastCtrlC = now - this.lastCtrlC;

    // If less than 2 seconds since last Ctrl+C, exit
    if (timeSinceLastCtrlC < 2000) {
      this.shutdown();
    } else {
      // First Ctrl+C - show message and update timestamp
      console.log();
      this.streamer.showWarning(i18n.t('cli.messages.pressAgainToExit') || 'Press Ctrl+C again to exit, or type "exit"');
      this.lastCtrlC = now;
    }
  }

  /**
   * Main interaction loop
   */
  async mainLoop() {
    while (this.isRunning) {
      try {
        const userInput = await this.getUserInput();

        if (!userInput || userInput.trim() === '') {
          continue;
        }

        // All input is treated as commands (no / prefix needed)
        await this.handleCommand(userInput);

      } catch (error) {
        if (error.isTtyError) {
          this.streamer.showError(i18n.t('cli.messages.renderError'));
          break;
        } else {
          this.streamer.showError(error);
        }
      }
    }
  }

  /**
   * Get user input with TAB completion support
   */
  async getUserInput() {
    return new Promise((resolve) => {
      // Create a completer function for TAB completion
      const completer = (line) => {
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
        const timeSinceLastCtrlC = now - this.lastCtrlC;

        // If less than 2 seconds since last Ctrl+C, exit
        if (timeSinceLastCtrlC < 2000) {
          rl.close();
          this.shutdown();
        } else {
          // First Ctrl+C - show message and update timestamp
          console.log();
          this.streamer.showWarning(i18n.t('cli.messages.pressAgainToExit') || 'Press Ctrl+C again to exit, or type "exit"');
          this.lastCtrlC = now;
          // Close this readline instance and start fresh
          rl.close();
          resolve('');
        }
      });

      // Create colorful prompt with parrot colors
      const promptText = chalk.rgb(34, 197, 94).bold(this.options.prompt);

      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Creates smart completions based on current input
   * @param {string} line - Current input line
   * @returns {Array} [completions, line]
   */
  createCompleter(line) {
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
   * @param {string} line - Current input line
   * @returns {Array} [completions, partial]
   */
  completeSquawkIgnore(line) {
    try {
      // Dynamically import git repository to get changed files
      const gitRepository = this.getGitRepository();
      if (!gitRepository) {
        return [[], ''];
      }

      const repo = new gitRepository();
      const changes = repo.getDetailedStatus();
      const availableFiles = changes.map(c => c.value);

      // Extract the part after the last --ignore
      const ignoreIndex = line.lastIndexOf('--ignore');
      if (ignoreIndex === -1) {
        return [[], ''];
      }

      const afterIgnore = line.substring(ignoreIndex + 8).trim();

      // Split by spaces to get individual words
      const words = afterIgnore.split(/\s+/).filter(w => w.length > 0);
      const currentWord = words[words.length - 1] || '';

      // Find matching files
      const hits = availableFiles.filter(file =>
        file.toLowerCase().startsWith(currentWord.toLowerCase())
      );

      // If multiple matches, show them
      if (hits.length > 1 && currentWord.length > 0) {
        console.log('\n' + chalk.dim('Matches: ' + hits.join(', ')));
      }

      // Return just the matching files and the current word being typed
      // readline will replace currentWord with the selected completion
      return [hits.length ? hits : availableFiles, currentWord];
    } catch (error) {
      return [[], ''];
    }
  }

  /**
   * Gets git repository class (lazy loaded to avoid circular dependency)
   */
  getGitRepository() {
    try {
      // Store reference if not already stored
      if (!this._gitRepository) {
        // Will be set from outside
        return null;
      }
      return this._gitRepository;
    } catch {
      return null;
    }
  }

  /**
   * Sets the git repository class for file completion
   */
  setGitRepository(gitRepoClass) {
    this._gitRepository = gitRepoClass;
  }

  /**
   * Handle commands (no / prefix needed)
   */
  async handleCommand(command) {
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
        break;

      case 'history':
        this.showHistory();
        break;

      case 'exit':
      case 'quit':
        await this.shutdown();
        break;

      default:
        // Call custom command handler if provided
        if (this.options.onCommand) {
          await this.options.onCommand(cmd, args, this);
        } else {
          this.streamer.showError(i18n.t('cli.messages.unknownCommand', { cmd }));
          this.streamer.showInfo(i18n.t('cli.messages.helpHint'));
        }
    }
  }

  /**
   * Show quick help
   */
  showQuickHelp() {
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
  showHelp() {
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
  showHistory() {
    console.log();
    console.log(chalk.white.bold(i18n.t('cli.history.title') + ':'));
    console.log();

    if (this.conversationHistory.length === 0) {
      console.log(chalk.dim('  ' + i18n.t('cli.history.empty')));
      console.log();
      return;
    }

    this.conversationHistory.forEach((entry, index) => {
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
  async shutdown() {
    this.streamer.stopThinking();
    console.log();
    this.streamer.showInfo(i18n.t('app.goodbye') + ' 👋');
    console.log();
    this.isRunning = false;
    process.exit(0);
  }

  /**
   * Simulate streaming response (for demonstration)
   */
  async simulateStreaming(text, delayMs = 20) {
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
  displayResponse(markdown) {
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
  displayToolUse(toolName, description) {
    this.streamer.showToolExecution(toolName, description);
  }

  /**
   * Display tool result
   */
  displayToolResult(toolName, success = true) {
    this.streamer.showToolResult(toolName, success);
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CLI;
