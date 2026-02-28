import { select, confirm, input, editor } from '@inquirer/prompts';
import search from '@inquirer/search';
import chalk from 'chalk';
import i18n from '../services/i18n.js';
import { loadConfig, saveConfig, getEnvVarForProvider } from '../services/config.js';
import type { AppConfig } from '../services/config.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import fs from 'fs';

// Interfaces
interface CommitConvention {
  type: string;
  format: string | null;
  verboseCommits: boolean;
}

interface PRTemplate {
  path: string | null;
  style: string;
}

interface SetupConfigParams {
  language: string;
  provider: string;
  ollamaUrl: string | null;
  model: string;
  convention: CommitConvention;
  prTemplate: PRTemplate;
  customInstructions: string;
}

interface SetupConfig {
  language: string;
  provider: string;
  apiKey: string | null;
  ollamaUrl: string | null;
  model: string;
  commitConvention: CommitConvention;
  prTemplatePath: string | null;
  prMessageStyle: string;
  customInstructions: string;
}

interface OllamaModel {
  name: string;
  size: number;
}

interface ProviderCredentials {
  apiKey: string | null;
  ollamaUrl: string | null;
}

interface PromptError extends Error {
  name: string;
}

// Constants
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b-instruct';
const MAX_INSTRUCTIONS_LENGTH = 1000;
const BYTES_TO_GB = 1e9;

const PR_TEMPLATE_PATHS = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md'
];

const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  claude: 'claude-sonnet-4-5',
  gemini: 'gemini-2.0-flash'
};

const SETUP_STEPS = {
  LANGUAGE: 'language',
  PROVIDER: 'provider',
  MODEL: 'model',
  CONVENTION: 'convention',
  CUSTOM: 'custom',
  INSTRUCTIONS: 'instructions'
};

const ENV_VAR_NAMES: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY'
};

const API_KEY_URLS: Record<string, string> = {
  openai: 'https://platform.openai.com/api-keys',
  claude: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://makersuite.google.com/app/apikey'
};

// Utility functions
const printStepHeader = (n: number, total: number, label: string): void => {
  console.log();
  console.log(chalk.dim(`  [${n}/${total}]`) + '  ' + chalk.white(label));
};

const showError = (message: string, hint: string | null = null): void => {
  console.log(chalk.red(`  ${message}`));
  if (hint) console.log(chalk.dim(`  ${hint}`));
};

const handleSetupError = (error: unknown): void => {
  const err = error as PromptError;
  if (err.name === 'ExitPromptError') {
    console.log();
    console.log(chalk.yellow(i18n.t('setup.setupCancelled') || 'Setup cancelled.'));
    process.exit(0);
  }
  throw error;
};

// Validation functions
const validateCustomFormat = (value: string | undefined): string | true => {
  if (!value?.trim()) {
    return i18n.t('setup.customCommitRequired') || 'Custom format cannot be empty';
  }
  return true;
};

const validateInstructions = (value: string | undefined): string | true => {
  if (value?.length && value.length > MAX_INSTRUCTIONS_LENGTH) {
    return i18n.t('setup.customInstructionsTooLong') ||
           `Instructions too long (max ${MAX_INSTRUCTIONS_LENGTH} characters)`;
  }
  return true;
};

async function showApiKeyInstructions(provider: string): Promise<void> {
  const envVar = ENV_VAR_NAMES[provider] || `${provider.toUpperCase()}_API_KEY`;
  const url = API_KEY_URLS[provider];

  console.log();
  console.log(chalk.dim('  ' + i18n.t('setup.apiKeyInstructions', { provider })));
  console.log();
  console.log(chalk.cyan(`    export ${envVar}=...`));
  console.log();
  if (url) {
    console.log(chalk.dim(`  Get your key at: ${url}`));
  }
  console.log(chalk.dim('  ' + i18n.t('setup.apiKeyPersist')));
  console.log();

  await confirm({
    message: i18n.t('setup.apiKeyReady'),
    default: true
  }, {
    clearPromptOnDone: true
  });
}

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  const client = new OpenAI({ apiKey });
  const page = await client.models.list();
  const skip = ['whisper', 'tts', 'dall-e', 'embed', 'moderation', 'davinci-0', 'babbage-0', 'ada-0'];
  return page.data
    .map(m => m.id)
    .filter(id => !skip.some(s => id.includes(s)))
    .sort((a, b) => b.localeCompare(a)); // newest first
}

async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  const client = new Anthropic({ apiKey });
  const page = await client.models.list({ limit: 100 });
  return page.data.map(m => m.id);
}

async function fetchGeminiModels(apiKey: string): Promise<string[]> {
  const client = new GoogleGenAI({ apiKey });
  // queryBase: true is required to list base foundation models
  const pager = await client.models.list({ config: { queryBase: true } });
  const models: string[] = [];
  for await (const model of pager) {
    const name = model.name?.replace('models/', '') ?? '';
    if (name.startsWith('gemini-')) {
      models.push(name);
    }
  }
  return models.sort((a, b) => b.localeCompare(a));
}

async function fetchAvailableModels(provider: string, apiKey: string): Promise<string[]> {
  switch (provider) {
    case 'openai':  return await fetchOpenAIModels(apiKey);
    case 'claude':  return await fetchAnthropicModels(apiKey);
    case 'gemini':  return await fetchGeminiModels(apiKey);
    default:        return [];
  }
}

async function selectFromModelList(provider: string, models: string[]): Promise<string> {
  const defaultModelsTyped: Record<string, string> = DEFAULT_MODELS;
  const defaultModel = defaultModelsTyped[provider];

  return await search<string>({
    message: `Select a model for ${provider}:`,
    source: (term: string | undefined) => {
      const filtered = term
        ? models.filter(m => m.toLowerCase().includes(term.toLowerCase()))
        : models;
      return filtered.map(m => ({
        value: m,
        name: m === defaultModel ? `${m} (recommended)` : m
      }));
    }
  }, {
    clearPromptOnDone: true
  });
}

/**
 * Interactive setup wizard for coParrot
 */
export async function setup(): Promise<SetupConfig | undefined> {
  console.log();
  console.log(chalk.dim('  setup') + '  ' + chalk.white('4 steps'));

  try {
    printStepHeader(1, 4, 'Language');
    const language = await selectLanguage();
    i18n.setLanguage(language);

    printStepHeader(2, 4, 'Provider');
    const provider = await selectProvider();
    const { apiKey, ollamaUrl } = await promptProviderCredentials(provider);

    printStepHeader(3, 4, 'Model');
    const model = await selectModel(provider, ollamaUrl, apiKey);

    printStepHeader(4, 4, 'Commit convention');
    const convention = await selectConvention();

    const prTemplate = await detectPRTemplate();

    console.log();
    console.log(chalk.dim('  [opt]') + '  ' + chalk.white('Custom instructions'));
    const customInstructions = await promptCustomInstructions();

    console.clear();

    return buildSetupConfig({
      language,
      provider,
      ollamaUrl,
      model,
      convention,
      prTemplate,
      customInstructions
    });
  } catch (error) {
    handleSetupError(error);
  }
}

/**
 * Run a specific setup step
 */
export async function setupStep(step: string): Promise<void> {
  const config = loadConfig();
  console.log();

  try {
    const stepHandlers: Record<string, () => Promise<Partial<AppConfig> | null>> = {
      [SETUP_STEPS.LANGUAGE]: async () => {
        const language = await selectLanguage();
        i18n.setLanguage(language);
        return { language };
      },

      [SETUP_STEPS.PROVIDER]: async () => {
        const provider = await selectProvider();
        const { apiKey, ollamaUrl } = await promptProviderCredentials(provider);
        const model = await selectModel(provider, ollamaUrl, apiKey);
        return { provider, apiKey: null, ollamaUrl, model };
      },

      [SETUP_STEPS.MODEL]: async () => {
        if (!config.provider) {
          showError('No provider configured.', 'Run "setup provider" first.');
          return null;
        }
        const envVar = getEnvVarForProvider(config.provider);
        const apiKey = envVar ? (process.env[envVar] ?? null) : null;
        const model = await selectModel(config.provider, config.ollamaUrl, apiKey);
        return { model };
      },

      [SETUP_STEPS.CONVENTION]: async () => {
        const commitConvention = await selectConvention();
        return { commitConvention };
      },

      [SETUP_STEPS.CUSTOM]: async () => {
        const customInstructions = await promptCustomInstructions();
        return { customInstructions };
      }
    };

    // Handle both 'custom' and 'instructions' aliases
    const handler = stepHandlers[step] || stepHandlers[SETUP_STEPS.CUSTOM];

    if (!handler) {
      showError(
        `Unknown setup step: ${step}`,
        'Available steps: language, provider, model, convention, custom'
      );
      return;
    }

    const updates = await handler();

    if (updates) {
      Object.assign(config, updates);
      saveConfig(config);
      console.log(chalk.dim('  saved'));
    }
  } catch (error) {
    const err = error as PromptError;
    if (err.name === 'ExitPromptError') {
      console.log();
      console.log(chalk.yellow('Setup cancelled.'));
    } else {
      throw error;
    }
  }
}

// Step implementations
async function selectLanguage(): Promise<string> {
  return await select({
    message: 'Choose your preferred language:',
    choices: [
      {
        name: 'English',
        value: 'en',
        description: 'Use English throughout the app'
      },
      {
        name: 'Português (Brasil)',
        value: 'pt-BR',
        description: 'Usar Português em todo o aplicativo'
      },
      {
        name: 'Español',
        value: 'es',
        description: 'Usar Español en toda la aplicación'
      }
    ],
    default: 'en'
  }, {
    clearPromptOnDone: true
  });
}

async function selectProvider(): Promise<string> {
  return await select({
    message: i18n.t('setup.selectProvider'),
    choices: ['openai', 'claude', 'gemini', 'ollama'].map(provider => ({
      name: i18n.t(`setup.providers.${provider}`),
      value: provider,
      description: i18n.t(`setup.providers.${provider}Desc`)
    }))
  }, {
    clearPromptOnDone: true
  });
}

async function promptProviderCredentials(provider: string): Promise<ProviderCredentials> {
  if (provider === 'ollama') {
    const ollamaUrl = await promptOllamaUrl();
    return { apiKey: null, ollamaUrl };
  }

  const detectedEnvVar = getEnvVarForProvider(provider);
  if (detectedEnvVar) {
    const apiKey = process.env[detectedEnvVar] ?? null;
    console.log();
    console.log(chalk.green('  ✓ ') + chalk.white(`${detectedEnvVar} detected`));
    return { apiKey, ollamaUrl: null };
  }

  await showApiKeyInstructions(provider);
  return { apiKey: null, ollamaUrl: null };
}

async function promptOllamaUrl(): Promise<string> {
  const url = await input({
    message: `Enter your Ollama URL (default: ${DEFAULT_OLLAMA_URL}): `,
    default: DEFAULT_OLLAMA_URL
  }, {
    clearPromptOnDone: true
  });

  return url.trim();
}

async function selectModel(provider: string, ollamaUrl: string | null = null, apiKey: string | null = null): Promise<string> {
  if (provider === 'ollama') {
    return await selectOllamaModel(ollamaUrl || DEFAULT_OLLAMA_URL);
  }

  if (apiKey) {
    process.stdout.write(chalk.dim('  Fetching available models...\r'));
    try {
      const models = await fetchAvailableModels(provider, apiKey);
      process.stdout.write('\x1B[2K\r');
      if (models.length > 0) {
        return await selectFromModelList(provider, models);
      }
    } catch (e) {
      const err = e as Error;
      process.stdout.write('\x1B[2K\r');
      console.log(chalk.dim(`  model listing failed: ${err.message}`));
    }
  } else {
    console.log(chalk.dim('  No API key found — enter model name manually.'));
  }

  return await promptModelName(provider);
}

async function selectOllamaModel(ollamaUrl: string): Promise<string> {
  try {
    const models = await fetchOllamaModels(ollamaUrl);

    if (models.length === 0) {
      console.log(chalk.yellow('  No models found. Please install a model first.'));
      return await promptModelName('ollama', DEFAULT_OLLAMA_MODEL);
    }

    return await select({
      message: 'Select an Ollama model:',
      choices: models.map(m => ({
        name: m.name,
        value: m.name,
        description: `Size: ${(m.size / BYTES_TO_GB).toFixed(2)} GB`
      }))
    }, {
      clearPromptOnDone: true
    });
  } catch (error) {
    console.log(chalk.yellow('  Could not connect to Ollama. Using default.'));
    return DEFAULT_OLLAMA_MODEL;
  }
}

async function fetchOllamaModels(ollamaUrl: string): Promise<OllamaModel[]> {
  const response = await axios.get(`${ollamaUrl}/api/tags`);
  return response.data.models || [];
}

async function promptModelName(provider: string, defaultModel: string | null = null): Promise<string> {
  const defaultModelsTyped: Record<string, string> = DEFAULT_MODELS;
  const model = await input({
    message: `Enter model name for ${provider}:`,
    default: defaultModel || defaultModelsTyped[provider] || ''
  }, {
    clearPromptOnDone: true
  });

  return model.trim();
}

async function selectConvention(): Promise<CommitConvention> {
  const conventions = ['conventional', 'gitmoji', 'simple', 'custom'];
  const convention = await select({
    message: i18n.t('setup.selectCommitConvention'),
    choices: conventions.map(conv => ({
      name: i18n.t(`setup.commitConventions.${conv}`),
      value: conv,
      description: i18n.t(`setup.commitConventions.${conv}Desc`)
    })),
    default: 'conventional'
  }, {
    clearPromptOnDone: true
  });

  if (convention === 'custom') {
    return await promptCustomConvention();
  }

  // Ask about verbose commits
  const verboseCommits = await confirm({
    message: 'Generate detailed commit messages with extended descriptions?',
    default: false
  }, {
    clearPromptOnDone: true
  });

  return { type: convention, format: null, verboseCommits };
}

async function promptCustomConvention(): Promise<CommitConvention> {
  console.log();
  console.log(chalk.dim('  ' + i18n.t('setup.customCommitHelp')));
  console.log();

  const customFormat = await editor({
    message: i18n.t('setup.enterCustomCommit'),
    default: i18n.t('setup.customCommitExample'),
    waitForUserInput: false,
    validate: validateCustomFormat
  }, {
    clearPromptOnDone: true
  });

  // Ask about verbose commits
  const verboseCommits = await confirm({
    message: 'Generate detailed commit messages with extended descriptions?',
    default: false
  }, {
    clearPromptOnDone: true
  });

  return {
    type: 'custom',
    format: customFormat.trim(),
    verboseCommits
  };
}

export async function detectPRTemplate(): Promise<PRTemplate> {
  for (const templatePath of PR_TEMPLATE_PATHS) {
    if (fs.existsSync(templatePath)) {
      return { path: templatePath, style: 'template' };
    }
  }

  return { path: null, style: 'detailed' };
}

async function promptCustomInstructions(): Promise<string> {
  const wantsCustom = await confirm({
    message: i18n.t('setup.wantsCustomInstructions'),
    default: false
  }, {
    clearPromptOnDone: true
  });

  if (!wantsCustom) return '';

  console.log();
  console.log(chalk.dim('  ' + i18n.t('setup.customInstructionsHelp')));
  console.log(chalk.dim('  ' + i18n.t('setup.customInstructionsEditor')));
  console.log();

  const instructions = await editor({
    message: i18n.t('setup.enterCustomInstructions'),
    default: i18n.t('setup.customInstructionsExample'),
    waitForUserInput: false,
    validate: validateInstructions
  }, {
    clearPromptOnDone: true
  });

  return instructions.trim();
}

function buildSetupConfig({
  language,
  provider,
  ollamaUrl,
  model,
  convention,
  prTemplate,
  customInstructions
}: SetupConfigParams): SetupConfig {
  return {
    language,
    provider,
    apiKey: null,
    ollamaUrl,
    model,
    commitConvention: convention,
    prTemplatePath: prTemplate.path,
    prMessageStyle: prTemplate.style,
    customInstructions
  };
}
