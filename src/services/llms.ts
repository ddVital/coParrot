
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { select, input } from '@inquirer/prompts';
import StreamingOutput from '../lib/streamer.js';
import chalk from 'chalk';
import { buildPrompts, PromptPair, type SessionContext } from './prompts.js';
import i18n from './i18n.js';
import axios from 'axios';


interface LLMOptions {
    provider: 'openai' | 'claude' | 'gemini' | 'ollama';
    apiKey?: string;
    ollamaUrl?: string;
    model?: string;
    instructions?: {
      commit?: string;
      pr?: string;
      custom?: string;
      commitConvention?: {
        type?: string;
        verboseCommits?: boolean;
      };
      prMessageStyle?: string;
      customInstructions?: string;
      sessionContext?: SessionContext | null;
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

class LLMOrchestrator {
  options: LLMOptions;
  client: OpenAI | Anthropic | GoogleGenAI | string | undefined;
  streamer: StreamingOutput;
  abortSignal: AbortSignal | null = null;

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
        return new OpenAI({ apiKey: this.options.apiKey });
      case 'claude':
        return new Anthropic({ apiKey: this.options.apiKey });
      case 'gemini':
        return new GoogleGenAI({ apiKey: this.options.apiKey });
      case 'ollama':
        return 'local';
      default:
        throw new Error(`Unsupported provider: ${this.options.provider}`);
    }
  }

  async call(context: unknown, type: string, customInstructions: string | null = null): Promise<string> {
    const prompts = this._buildPrompts(type, context, customInstructions);
    let result: string | null = null;

    switch (this.options.provider.toLowerCase()) {
      case 'openai':
        result = await this._callOpenAI(prompts);
        break;
      case 'claude':
        result = await this._callClaude(prompts);
        break;
      case 'gemini':
        result = await this._callGemini(prompts);
        break;
      case 'ollama':
        result = await this._callOllama(prompts);
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
    const formattedResponse = chalk.grey('## ') + chalk.white(response);
    const promptMessage = formattedResponse + '\n\n' + i18n.t('llm.approvalPrompt');

    const action = await select<'approve' | 'retry' | 'retry_with_instructions'>({
      message: promptMessage,
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
        this.streamer.stopThinking();
        throw error;
      }
    }

    return response;
  }

  async generateCommitMessage(context: unknown, customInstructions: string | null = null): Promise<string | null> {
    return this.generateWithApproval('commit', context, {
      loadingMessage: 'Generating commit message...',
      customInstructions
    });
  }

  async generatePrMessage(context: unknown, customInstructions: string | null = null): Promise<string | null> {
    return this.generateWithApproval('pr', context, {
      loadingMessage: 'Generating PR description...',
      customInstructions
    });
  }

  /**
   * Generate commit message directly without UI/approval (for hooks)
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

  /**
   * Build prompts using the centralized prompt builder
   */
  _buildPrompts(type: string, context: unknown, customInstructions: string | null = null): PromptPair {
    const baseInstructions = this.options.instructions?.customInstructions || '';

    let convention: string | undefined;
    let style: string | undefined;
    let verbose: boolean | undefined;

    switch (type) {
      case 'commit':
        convention = this.options.instructions?.commitConvention?.type || 'conventional';
        verbose = this.options.instructions?.commitConvention?.verboseCommits || false;
        break;
      case 'branch':
        convention = this.options.instructions?.commitConvention?.type || 'gitflow';
        break;
      case 'pr':
        style = this.options.instructions?.prMessageStyle || 'detailed';
        break;
    }

    return buildPrompts(type, context, {
      convention,
      style,
      baseInstructions,
      customInstructions,
      verbose,
      sessionContext: this.options.instructions?.sessionContext ?? null
    });
  }

  /**
   * OpenAI API call with separate system and user prompts
   */
  async _callOpenAI(prompts: PromptPair): Promise<string | null> {
    const client = this.client as OpenAI;
    const response = await client.chat.completions.create({
      model: this.options.model || 'gpt-4',
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.user }
      ]
    }, { signal: this.abortSignal ?? undefined });

    return response.choices[0].message.content;
  }

  /**
   * Claude API call with separate system and user prompts
   */
  async _callClaude(prompts: PromptPair): Promise<string | null> {
    const client = this.client as Anthropic;
    const response = await client.messages.create({
      model: this.options.model || 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: prompts.system,
      messages: [{ role: 'user', content: prompts.user }]
    }, { signal: this.abortSignal ?? undefined });

    const textBlock = response.content[0] as { type: 'text'; text: string };
    return textBlock.text;
  }

  /**
   * Gemini API call with separate system instruction and user content
   */
  async _callGemini(prompts: PromptPair): Promise<string | null> {
    const client = this.client as GoogleGenAI;
    const response = await client.models.generateContent({
      model: this.options.model || 'gemini-2.0-flash',
      config: {
        systemInstruction: prompts.system
      },
      contents: prompts.user
    });

    return response.text ?? null;
  }

  /**
   * Ollama API call with separate system and user prompts
   */
  async _callOllama(prompts: PromptPair): Promise<string | null> {
    try {
      const response = await axios.post(`${this.options.ollamaUrl}/api/generate`, {
        model: this.options.model,
        system: prompts.system,
        prompt: prompts.user,
        stream: false
      }, { signal: this.abortSignal ?? undefined });

      return response.data.response;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ECONNREFUSED') {
        throw new Error('Ollama server not running. Start it with: ollama serve');
      }
      throw error;
    }
  }

}

export default LLMOrchestrator;
