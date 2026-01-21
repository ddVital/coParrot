import { marked } from 'marked';
// @ts-ignore - marked-terminal has no type declarations
import { markedTerminal } from 'marked-terminal';
import { highlight } from 'cli-highlight';
import chalk from 'chalk';

interface RendererOptions {
  width?: number;
  showSectionPrefix?: boolean;
}

/**
 * Custom renderer for markdown with syntax highlighting
 */
class MarkdownRenderer {
  options: Required<RendererOptions>;

  constructor(options: RendererOptions = {}) {
    this.options = {
      width: options.width || process.stdout.columns || 80,
      showSectionPrefix: options.showSectionPrefix !== false,
      ...options
    } as Required<RendererOptions>;

    // Configure marked with terminal renderer
    marked.use(markedTerminal({
      width: this.options.width - 4, // Account for padding
      code: (code: string, lang: string) => {
        try {
          const highlighted = highlight(code, {
            language: lang || 'javascript',
            theme: {
              keyword: chalk.cyan,
              built_in: chalk.cyan,
              type: chalk.cyan.dim,
              literal: chalk.blue,
              number: chalk.green,
              string: chalk.green,
              comment: chalk.gray,
              meta: chalk.gray,
              'meta-keyword': chalk.gray,
              'meta-string': chalk.green,
              section: chalk.white.bold,
              tag: chalk.white,
              name: chalk.white,
              'builtin-name': chalk.cyan,
              attr: chalk.cyan,
              attribute: chalk.cyan,
              variable: chalk.white,
              params: chalk.white,
              title: chalk.white.bold,
            }
          });
          return this._formatCodeBlock(highlighted, lang);
        } catch (e) {
          return this._formatCodeBlock(code, lang);
        }
      },
      codespan: (code: string) => chalk.bgGray.white(` ${code} `),
      strong: (text: string) => chalk.bold(text),
      em: (text: string) => chalk.italic(text),
      link: (href: string, title: string, text: string) => chalk.cyan.underline(text),
      list: (body: string, ordered: boolean) => body,
      listitem: (text: string) => `  ${chalk.gray('•')} ${text}`,
      paragraph: (text: string) => text + '\n',
      heading: (text: string, level: number) => {
        switch (level) {
          case 1:
            return chalk.bold.white(text) + '\n';
          case 2:
            return chalk.bold.white(text) + '\n';
          case 3:
            return chalk.white(text) + '\n';
          default:
            return chalk.dim(text) + '\n';
        }
      }
    }));
  }

  /**
   * Format a code block with border and language label
   */
  _formatCodeBlock(code: string, lang?: string): string {
    const lines = code.split('\n');
    const topBorder = chalk.gray('┌' + '─'.repeat(this.options.width - 6) + '┐');
    const bottomBorder = chalk.gray('└' + '─'.repeat(this.options.width - 6) + '┘');
    const langLabel = lang ? chalk.gray(` ${lang} `) : '';

    const formattedLines = lines.map(line =>
      chalk.gray('│ ') + line.padEnd(this.options.width - 8) + chalk.gray(' │')
    );

    return '\n' + topBorder + langLabel + '\n' + formattedLines.join('\n') + '\n' + bottomBorder + '\n';
  }

  /**
   * Render markdown text to terminal
   */
  render(markdown: string): string {
    try {
      return marked(markdown) as string;
    } catch (error) {
      console.error(chalk.red('Error rendering markdown:'), error);
      return markdown;
    }
  }

  /**
   * Render a tool use block
   */
  renderToolUse(toolName: string, description: string): string {
    const icon = this._getToolIcon(toolName);
    const line = chalk.gray('─'.repeat(this.options.width - 4));

    return `\n${line}\n${icon} ${chalk.cyan.bold(toolName)}: ${chalk.dim(description)}\n`;
  }

  /**
   * Render a tool result
   */
  renderToolResult(toolName: string, success: boolean = true): string {
    const icon = success ? chalk.green('✓') : chalk.red('✗');
    const status = success ? chalk.green('Success') : chalk.red('Failed');

    return `${icon} ${chalk.cyan(toolName)}: ${status}\n`;
  }

  /**
   * Get icon for tool type
   */
  _getToolIcon(toolName: string): string {
    const icons: Record<string, string> = {
      'Read': '📖',
      'Write': '✏️',
      'Edit': '✏️',
      'Bash': '⚡',
      'Grep': '🔍',
      'Glob': '📁',
      'WebFetch': '🌐',
      'WebSearch': '🔎',
    };
    return icons[toolName] || '🔧';
  }
}

export default MarkdownRenderer;
