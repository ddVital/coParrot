
import OpenAI from 'openai';
import { confirm, select, input } from '@inquirer/prompts';
import StreamingOutput from '../lib/streamer.js';
import chalk from 'chalk';


class LLMOrchestrator {
  constructor(options = {}) {
    this.options = {
      provider: options.provider || 'openAI',
      apiKey: options.apiKey,
      model: options.model,
      instructions: options.instructions || {},
      ...options
    };

    this.client = this._initializeClient();
    this.streamer = new StreamingOutput();
  }

  _initializeClient() {
    switch (this.options.provider.toLowerCase()) {
      case 'openai':
        return new OpenAI({ apiKey: this.options.apiKey });
        break;
      case 'claude':
        return new Anthropic({ apiKey: this.options.apiKey });
        break;
      case 'gemini':
        return new GoogleGenerativeAI(this.options.apiKey);
        break;
      default:
        throw new Error(`Unsupported provider: ${this.options.provider}`);
    }
  }

  async call(context, type, customInstructions = null) {
    // Chamar o método específico do provider
    switch (this.options.provider.toLowerCase()) {
      case 'openai':
        return this._callOpenAI(context, type, customInstructions);
      case 'claude':
        return this._callClaude(context, type, customInstructions);
      case 'gemini':
        return this._callGemini(context, type, customInstructions);
      default:
        throw new Error(`Unsupported provider: ${this.options.provider}`);
    }
  }

  async approveLLMResponse(response) {
    // Create visual separator
    const separator = chalk.gray('═'.repeat(process.stdout.columns || 80));

    // Display the response with enhanced formatting
    console.log('\n' + separator);
    console.log(chalk.cyan.bold('  AI Generated Message:'));
    console.log(separator);
    console.log(chalk.white.bold('\n' + response + '\n'));
    console.log(separator + '\n');

    // Present options to the user
    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: '✓ Approve and use this response', value: 'approve' },
        { name: '↻ Retry (generate a new response)', value: 'retry' },
        { name: '✎ Retry with custom instructions', value: 'retry_with_instructions' }
      ]
    });

    if (action === 'retry_with_instructions') {
      const customInstructions = await input({
        message: 'Enter your custom instructions:'
      });
      return { action, customInstructions };
    }

    return { action };
  }

  async generateCommitMessage(context, customInstructions = null) {
    let approved = false;
    let response = null;

    while (!approved) {
      try {
        // Show loading indicator
        this.streamer.startThinking('Generating commit message...');

        // Call the LLM
        response = await this.call(context, "commit", customInstructions);

        // Stop loading indicator
        this.streamer.stopThinking();

        // Get user approval
        const result = await this.approveLLMResponse(response);

        if (result.action === 'approve') {
          approved = true;
          return response;
        } else if (result.action === 'retry') {
          // Retry without custom instructions
          customInstructions = null;
          continue;
        } else if (result.action === 'retry_with_instructions') {
          // Retry with custom instructions
          customInstructions = result.customInstructions;
          continue;
        }
      } catch (error) {
        this.streamer.stopThinking();
        this.streamer.showError(`Error generating commit message: ${error.message}`);
        throw error;
      }
    }

    return response;
  }

  async _callOpenAI(context, type, customInstructions = null) {
    const response = await this.client.chat.completions.create({
      model: this.options.model || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: this._buildSystemPrompt(type, customInstructions)
        },
        {
          role: 'user',
          content: JSON.stringify(context)
        }
      ]
    });

    return response.choices[0].message.content;
  }

  async _callClaude(context, type, customInstructions = null) {
    const response = await this.client.messages.create({
      model: this.options.model || 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: this._buildSystemPrompt(type, customInstructions),
      messages: [
        {
          role: 'user',
          content: JSON.stringify(context)
        }
      ]
    });

    return response.content[0].text;
  }

  async _callGemini(context, type, customInstructions = null) {
    const model = this.client.getGenerativeModel({
      model: this.options.model || 'gemini-pro'
    });

    const prompt = `${this._buildSystemPrompt(type, customInstructions)}\n\n${JSON.stringify(context)}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;

    return response.text();
  }

  /**
     * Constrói o system prompt baseado no tipo de requisição
     */
  _buildSystemPrompt(type, customInstructions = null) {
    const baseInstructions = this.options.instructions.customInstructions || '';
    const additionalInstructions = customInstructions ? `\n\nAdditional instructions: ${customInstructions}` : '';

    switch (type) {
      case 'commit':
        return `You are a helpful git assistant. Generate a commit message following the
${this.options.instructions.commitConvention?.type || 'conventional'} convention.\n${baseInstructions}${additionalInstructions}`;

      case 'branch':
        return `You are a helpful git assistant. Generate a branch name following the
${this.options.instructions.branchNaming?.type || 'gitflow'} convention.\n${baseInstructions}${additionalInstructions}`;

      case 'pr':
        return `You are a helpful git assistant. Generate a PR description in ${this.options.instructions.prMessageStyle
|| 'detailed'} style.\n${baseInstructions}${additionalInstructions}`;

      default:
        return `You are a helpful git assistant.\n${baseInstructions}${additionalInstructions}`;
    }
  }
}

export default LLMOrchestrator;
