
import OpenAI from 'openai';
import {GoogleGenAI} from '@google/genai';

import { confirm, select, input } from '@inquirer/prompts';
import StreamingOutput from '../lib/streamer.js';
import chalk from 'chalk';
import { buildSystemPrompt } from './prompts.js';
import i18n from './i18n.js';
import axios from 'axios';
import logUpdate from "log-update";

class LLMOrchestrator {
  constructor(options = {}) {
    this.options = {
      provider: options.provider || 'openAI',
      ollamaUrl: options.ollamaUrl, 
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
      case 'ollama':
        return "local"
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
      case 'ollama':
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
    }, {
      clearPromptOnDone: true
    });

    if (action === 'retry_with_instructions') {
      const customInstructions = await input({
        message: i18n.t('llm.customInstructionsPrompt')
      }, {
        clearPromptOnDone: true
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
        this.streamer.startThinking(loadingMessage);
        response = await this.call(context, type, currentInstructions);
        this.streamer.stopThinking();

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
      } catch (error) {
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

  async generatePrMessage(context, customInstructions = null) {
    return this.generateWithApproval('pr', context, {
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
    // For branch type, extract description from context object
    const userContent = type === 'branch' && context?.description
      ? context.description
      : JSON.stringify(context);

    const response = await this.client.chat.completions.create({
      model: this.options.model || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: this._buildSystemPrompt(type, customInstructions, context)
        },
        {
          role: 'user',
          content: userContent
        }
      ]
    });

    return response.choices[0].message.content;
  }

  async _callClaude(context, type, customInstructions = null) {
    // For branch type, extract description from context object
    const userContent = type === 'branch' && context?.description
      ? context.description
      : JSON.stringify(context);

    const response = await this.client.messages.create({
      model: this.options.model || 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: this._buildSystemPrompt(type, customInstructions, context),
      messages: [
        {
          role: 'user',
          content: userContent
        }
      ]
    });

    return response.content[0].text;
  }

  async _callGemini(context, type, customInstructions = null) {
    // For branch type, extract description from context object
    const userContent = type === 'branch' && context?.description
      ? context.description
      : JSON.stringify(context);

    const prompt = `${this._buildSystemPrompt(type, customInstructions, context)}\n\n${userContent}`;

    const response = await this.client.models.generateContent({
      model: this.options.model || 'gemini-2.5-flash',
      contents: prompt
    })

    return response.text();
  }

  async _callLlama(context, type, customInstructions = null) {
    // For branch type, extract description from context object
    const userContent = type === 'branch' && context?.description
      ? context.description
      : JSON.stringify(context);

    const prompt = `${this._buildSystemPrompt(type, customInstructions, context)}\n\n${userContent}`;
    const response = await this._handleLocalLlmCall(prompt)

    return response
    // const response = await this.client
  }

  async _handleLocalLlmCall(prompt) {
    console.log(prompt)

    try {
      const response = await axios.post(`${this.options.ollamaUrl}/api/generate`, {
        model: this.options.model, // hard coded before we can implement a more scalable solution
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
   * @param {Object} context - The context object (may contain recentBranches for branch type)
   * @returns {string} The complete system prompt
   */
  _buildSystemPrompt(type, customInstructions = null, context = null) {
    const baseInstructions = this.options.instructions.customInstructions || '';

    // Determine convention/style based on type
    let convention, style, recentBranches, verbose;

    switch (type) {
      case 'commit':
        convention = this.options.instructions.commitConvention?.type || 'conventional';
        verbose = this.options.instructions.commitConvention?.verboseCommits || false;
        break;
      case 'branch':
        // Use commit convention for branches, default to gitflow if not set
        convention = this.options.instructions.commitConvention?.type || 'gitflow';
        // Extract recent branches from context if available
        recentBranches = context?.recentBranches || [];
        break;
      case 'pr':
        style = this.options.instructions.prMessageStyle || 'detailed';
        break;
    }

    // Build the prompt using the centralized prompt builder
    return buildSystemPrompt(type, {
      convention,
      style,
      baseInstructions,
      customInstructions,
      recentBranches,
      verbose
    });
  }

  _showLLMResponse(response) {
    console.log('\n' + chalk.grey('## ') + chalk.white(response) + '\n');
  }
}

export default LLMOrchestrator;
