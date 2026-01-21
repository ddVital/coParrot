
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { select, input } from '@inquirer/prompts';
import StreamingOutput from '../lib/streamer.js';
import chalk from 'chalk';
import { buildSystemPrompt } from './prompts.js';
import i18n from './i18n.js';
import axios from 'axios';


interface LLMOptions {
    provider: 'openai' | 'claude' | 'gemini' | 'ollama';
    apiKey?: string;
    ollamaUrl?: string;
    model?: string;
    instructions?: {
      commit?: string;
      review?: string;
      pr?: string;
      custom?: string;
      commitConvention?: {
        type?: string;
        verboseCommits?: boolean;
      };
      prMessageStyle?: string;
      customInstructions?: string;
    };
    skipApproval?: boolean;
  }

interface ApprovalResult {
    action: 'approve' | 'retry' | 'retry_with_instructions';
    customInstructions?: string;
  }

interface GenerateOptions {
    loadingMessage?: string;
    customInstructions?: string | null;
  }

  interface BranchContext {
    description?: string;
    recentBranches?: string[];
  }

class LLMOrchestrator {
  options: LLMOptions;
  client: OpenAI | Anthropic | GoogleGenAI | string | undefined;
  streamer: any; // TODO: type properly when streamer.ts is migrated

  constructor(options: Partial<LLMOptions> = {}) {
    this.options = {
      provider: options.provider || 'openai',
      ollamaUrl: options.ollamaUrl,
      apiKey: options.apiKey,
      model: options.model,
      instructions: options.instructions || {},
      skipApproval: options.skipApproval || false,
      ...options
    };

    this.client = this._initializeClient();
    this.streamer = new StreamingOutput(null);
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

  async call(context: unknown, type: string, customInstructions: string | null = null): Promise<string> {
    let result: string | null = null;

    switch (this.options.provider.toLowerCase()) {
      case 'openai':
        result = await this._callOpenAI(context, type, customInstructions);
        break;
      case 'claude':
        result = await this._callClaude(context, type, customInstructions);
        break;
      case 'gemini':
        result = await this._callGemini(context, type, customInstructions);
        break;
      case 'ollama':
        result = await this._callLlama(context, type, customInstructions);
        break;
      default:
        throw new Error(`Unsupported provider: ${this.options.provider}`);
    }

    if (!result) {
      throw new Error('LLM returned empty response');
    }
    return result;
  }

  async approveLLMResponse(response: string): Promise<ApprovalResult> {
    this._showLLMResponse(response);

    // Present options to the user
    const action = await select<'approve' | 'retry' | 'retry_with_instructions'>({
      message: i18n.t('llm.approvalPrompt'),
      choices: [
        { name: i18n.t('llm.approvalOptions.approve'), value: 'approve' as const },
        { name: i18n.t('llm.approvalOptions.retry'), value: 'retry' as const },
        { name: i18n.t('llm.approvalOptions.retryWithInstructions'), value: 'retry_with_instructions' as const }
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

  async generateWithApproval(type: string, context: unknown, options: GenerateOptions = {}): Promise<string | null> {
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
          ? { action: 'approve' as const }
          : await this.approveLLMResponse(response);

        if (result.action === 'approve') {
          approved = true;
          return response;
        } else if (result.action === 'retry') {
          currentInstructions = null;
        } else if (result.action === 'retry_with_instructions') {
          currentInstructions = result.customInstructions ?? null;
        }
      } catch (error) {
        throw error;
      }
    }

    return response;
  }

  // Then usage becomes simple:
  async generateCommitMessage(context: unknown, customInstructions: string | null = null): Promise<string | null> {
    return this.generateWithApproval('commit', context, {
      loadingMessage: 'Generating commit message...',
      customInstructions
    });
  }

  async generatePrMessage(context: unknown, customInstructions: string | null = null): Promise<string | null> {
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
  async generateCommitMessageDirect(context: unknown): Promise<string> {
    return await this.call(context, 'commit', null);
  }

  async generateBranchName(context: unknown, customInstructions: string | null = null): Promise<string | null> {
    return this.generateWithApproval('branch', context, {
      loadingMessage: 'Generating branch name...',
      customInstructions
    });
  }

  async _callOpenAI(context: unknown, type: string, customInstructions: string | null = null): Promise<string | null> {
    // For branch type, extract description from context object
    const ctx = context as BranchContext;
    const userContent = type === 'branch' && ctx?.description
      ? ctx.description
      : JSON.stringify(context);

    const client = this.client as OpenAI;
    const response = await client.chat.completions.create({
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

  async _callClaude(context: unknown, type: string, customInstructions: string | null = null): Promise<string | null> {
    // For branch type, extract description from context object
    const ctx = context as BranchContext;
    const userContent = type === 'branch' && ctx?.description
      ? ctx.description
      : JSON.stringify(context);

    const client = this.client as Anthropic;
    const response = await client.messages.create({
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

    const textBlock = response.content[0] as { type: 'text'; text: string };
    return textBlock.text;
  }

  async _callGemini(context: unknown, type: string, customInstructions: string | null = null): Promise<string | null> {
    // For branch type, extract description from context object
    const ctx = context as BranchContext;
    const userContent = type === 'branch' && ctx?.description
      ? ctx.description
      : JSON.stringify(context);

    const prompt = `${this._buildSystemPrompt(type, customInstructions, context)}\n\n${userContent}`;

    const client = this.client as GoogleGenAI;
    const response = await client.models.generateContent({
      model: this.options.model || 'gemini-2.5-flash',
      contents: prompt
    })

    return response.text ?? null;
  }

  async _callLlama(context: unknown, type: string, customInstructions: string | null = null): Promise<string | null> {
    // For branch type, extract description from context object
    const ctx = context as BranchContext;
    const userContent = type === 'branch' && ctx?.description
      ? ctx.description
      : JSON.stringify(context);

    const prompt = `${this._buildSystemPrompt(type, customInstructions, context)}\n\n${userContent}`;
    const response = await this._handleLocalLlmCall(prompt)

    return response
    // const response = await this.client
  }

  async _handleLocalLlmCall(prompt: string): Promise<string | null> {
    console.log(prompt)

    try {
      const response = await axios.post(`${this.options.ollamaUrl}/api/generate`, {
        model: this.options.model,
        prompt: prompt,
        stream: false
      })

      return response.data.response;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ECONNREFUSED") {
        throw err.code;
      }
      return null;
    }
  }

  /**
   * Builds the system prompt based on the request type
   * @param {string} type - The type of request (commit, branch, pr, review)
   * @param {string|null} customInstructions - Additional custom instructions
   * @param {Object} context - The context object (may contain recentBranches for branch type)
   * @returns {string} The complete system prompt
   */
  _buildSystemPrompt(type: string, customInstructions: string | null = null, context: unknown = null): string {
    const baseInstructions = this.options.instructions?.customInstructions || '';
    const ctx = context as BranchContext;

    // Determine convention/style based on type
    let convention: string | undefined;
    let style: string | undefined;
    let recentBranches: string[] | undefined;
    let verbose: boolean | undefined;

    switch (type) {
      case 'commit':
        convention = this.options.instructions?.commitConvention?.type || 'conventional';
        verbose = this.options.instructions?.commitConvention?.verboseCommits || false;
        break;
      case 'branch':
        // Use commit convention for branches, default to gitflow if not set
        convention = this.options.instructions?.commitConvention?.type || 'gitflow';
        // Extract recent branches from context if available
        recentBranches = ctx?.recentBranches || [];
        break;
      case 'pr':
        style = this.options.instructions?.prMessageStyle || 'detailed';
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

  _showLLMResponse(response: string): void {
    console.log('\n' + chalk.grey('## ') + chalk.white(response) + '\n');
  }
}

export default LLMOrchestrator;
