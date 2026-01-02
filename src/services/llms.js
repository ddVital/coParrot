
import OpenAI from 'openai';
import {GoogleGenAI} from '@google/genai';

import { confirm, select, input } from '@inquirer/prompts';
import StreamingOutput from '../lib/streamer.js';
import chalk from 'chalk';
import { buildSystemPrompt } from './prompts.js';
import i18n from './i18n.js';
import axios from 'axios';

class LLMOrchestrator {
  constructor(options = {}) {
    this.options = {
      provider: options.provider || 'openAI',
      apiKey: options.apiKey,
      model: options.model,
      instructions: options.instructions || {},
      skipApproval: options.skipApproval || false,
      ...options
    };

    this.client = this._initializeClient();
    this.streamer = new StreamingOutput();
  }

  _initializeClient() {
    switch (this.options.provider.toLowerCase()) {
      case 'openai':
        console.log("op")
        // return new OpenAI({ apiKey: this.options.apiKey });
        break;
      case 'claude':
        return new Anthropic({ apiKey: this.options.apiKey });
        break;
      case 'gemini':
        return new GoogleGenAI({ apiKey: this.options.apiKey });
        break;
      case 'llama':
        return "local"
      default:
        throw new Error(`Unsupported provider: ${this.options.provider}`);
    }
  }

  async call(context, type, customInstructions = null) {
    // Chamar o método específico do provider
    switch (this.options.provider.toLowerCase()) {
      case 'openai':
        // setTimeout(() => {
        return { messages: "feat(commit): adds a message to your console"}
      // }, 4000);
      // return this._callOpenAI(context, type, customInstructions);
      case 'claude':
        return this._callClaude(context, type, customInstructions);
      case 'gemini':
        return this._callGemini(context, type, customInstructions);
      case 'llama':
        console.log('trying to call llama')
        return this._callLlama(context, type, customInstructions);
      default:
        throw new Error(`Unsupported provider: ${this.options.provider}`);
    }
  }

  async approveLLMResponse(response) {
    this._showLLMResponse(response);

    // Present options to the user
    const action = await select({
      message: i18n.t('llm.approvalPrompt'),
      choices: [
        { name: i18n.t('llm.approvalOptions.approve'), value: 'approve' },
        { name: i18n.t('llm.approvalOptions.retry'), value: 'retry' },
        { name: i18n.t('llm.approvalOptions.retryWithInstructions'), value: 'retry_with_instructions' }
      ]
    });

    if (action === 'retry_with_instructions') {
      const customInstructions = await input({
        message: i18n.t('llm.customInstructionsPrompt')
      });
      return { action, customInstructions };
    }

    return { action };
  }

  async generateWithApproval(type, context, options = {}) {
    const {
      loadingMessage = 'Generating...',
      customInstructions = null
    } = options;

    let approved = false;
    let response = null;
    let currentInstructions = customInstructions;

    while (!approved) {
      try {
        // Use shimmer effect for generation
        const operation = this.streamer.startGeneratingOperation(loadingMessage);

        // Add substeps to show what's happening
        operation.substep(`Processing ${type} request`);
        operation.substep(`Calling ${this.options.provider} API`);

        response = await this.call(context, type, currentInstructions);

        // Mark as complete (will auto-clear after brief moment)
        operation.complete(i18n.t('llm.generationComplete'));

        const result = this.options.skipApproval
          ? { action: 'approve' }
          : await this.approveLLMResponse(response);

        if (result.action === 'approve') {
          approved = true;
          return response;
        } else if (result.action === 'retry') {
          currentInstructions = null;
        } else if (result.action === 'retry_with_instructions') {
          currentInstructions = result.customInstructions;
        }

        operation.complete(i18n.t('llm.generationComplete'));
      } catch (error) {
        this.streamer.clearTransient();
        this.streamer.showError(`Error generating ${type}: ${error}`);
        throw error;
      }
    }

    return response;
  }

  // Then usage becomes simple:
  async generateCommitMessage(context, customInstructions = null) {
    return this.generateWithApproval('commit', context, {
      loadingMessage: 'Generating commit message...',
      customInstructions
    });
  }

  /**
   * Generate commit message directly without UI/approval (for hooks)
   * @param {*} context - The diff context
   * @returns {Promise<string>} The generated commit message
   */
  async generateCommitMessageDirect(context) {
    return await this.call(context, 'commit', null);
  }

  async generateBranchName(context, customInstructions = null) {
    return this.generateWithApproval('branch', context, {
      loadingMessage: 'Generating branch name...',
      customInstructions
    });
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
    const prompt = `${this._buildSystemPrompt(type, customInstructions)}\n\n${JSON.stringify(context)}`;

    const response = await this.client.models.generateContent({
      model: this.options.model || 'gemini-2.5-flash',
      contents: prompt
    })

    return response.text();
  }

  async _callLlama(context, type, customInstructions = null) {
    const prompt = `${this._buildSystemPrompt(type, customInstructions)}\n\n${JSON.stringify(context)}`;
    const response = await this._handleLocalLlmCall(prompt)

    return response
    // const response = await this.client
  }

  async _handleLocalLlmCall(prompt) {
    try {
      const response = await axios.post("http://localhost:11434/api/generate", {
        model: "qwen2.5:3b-instruct", // hard coded before we can implement a more scalable solution
        prompt: prompt,
        stream: false
      })

      return response.data.response;
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        throw error.code
      }
    }
  }
  /**
   * Builds the system prompt based on the request type
   * @param {string} type - The type of request (commit, branch, pr, review)
   * @param {string|null} customInstructions - Additional custom instructions
   * @returns {string} The complete system prompt
   */
  _buildSystemPrompt(type, customInstructions = null) {
    const baseInstructions = this.options.instructions.customInstructions || '';

    // Determine convention/style based on type
    let convention, style;

    switch (type) {
      case 'commit':
        convention = this.options.instructions.commitConvention?.type || 'conventional';
        break;
      case 'branch':
        convention = this.options.instructions.branchNaming?.type || 'gitflow';
        break;
      case 'pr':
        style = this.options.instructions.prMessageStyle || 'detailed';
        break;
      case 'review':
        style = this.options.instructions.codeReviewStyle || 'detailed';
        break;
    }

    // Build the prompt using the centralized prompt builder
    return buildSystemPrompt(type, {
      convention,
      style,
      baseInstructions,
      customInstructions
    });
  }

  _showLLMResponse(response) {
    // Create visual separator

    // Display the response with enhanced formatting
    console.log(chalk.cyan.bold('  ' + i18n.t('llm.approvalTitle')));
    console.log(chalk.white.bold('\n' + response + '\n'));
  }
}

export default LLMOrchestrator;
