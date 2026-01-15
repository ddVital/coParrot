import { select, password, confirm, input, editor } from '@inquirer/prompts';
import chalk from 'chalk';
import i18n from '../services/i18n.js';
import { loadConfig, saveConfig } from '../services/config.js';
import axios from 'axios';
import fs from 'fs';

// Constants
const BANNER_WIDTH = 60;
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b-instruct';
const MIN_API_KEY_LENGTH = 10;
const MAX_INSTRUCTIONS_LENGTH = 1000;
const BYTES_TO_GB = 1e9;

const PR_TEMPLATE_PATHS = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md'
];

const DEFAULT_MODELS = {
  openai: 'gpt-4',
  claude: 'claude-3-5-sonnet-20241022',
  gemini: 'gemini-2.0-flash-exp'
};

const SETUP_STEPS = {
  LANGUAGE: 'language',
  PROVIDER: 'provider',
  MODEL: 'model',
  CONVENTION: 'convention',
  CUSTOM: 'custom',
  INSTRUCTIONS: 'instructions'
};

// Utility functions
const showBanner = (title, subtitle = null) => {
  console.log();
  console.log(chalk.cyan.bold('═'.repeat(BANNER_WIDTH)));
  console.log(chalk.cyan.bold(title));
  if (subtitle) console.log(chalk.dim(`  ${subtitle}`));
  console.log(chalk.cyan.bold('═'.repeat(BANNER_WIDTH)));
  console.log();
};

const showSuccess = (message) => {
  console.log();
  console.log(chalk.green('✓ ') + chalk.white(message));
  console.log();
};

const showError = (message, hint = null) => {
  console.log(chalk.red(`  ${message}`));
  if (hint) console.log(chalk.dim(`  ${hint}`));
};

const handleSetupError = (error) => {
  if (error.name === 'ExitPromptError') {
    console.log();
    console.log(chalk.yellow(i18n.t('setup.setupCancelled') || 'Setup cancelled.'));
    process.exit(0);
  }
  throw error;
};

// Validation functions
const validateApiKey = (value) => {
  if (!value?.trim()) return 'API key cannot be empty';
  if (value.trim().length < MIN_API_KEY_LENGTH) {
    return 'API key seems too short. Please check and try again.';
  }
  return true;
};

const validateCustomFormat = (value) => {
  if (!value?.trim()) {
    return i18n.t('setup.customCommitRequired') || 'Custom format cannot be empty';
  }
  return true;
};

const validateInstructions = (value) => {
  if (value?.length > MAX_INSTRUCTIONS_LENGTH) {
    return i18n.t('setup.customInstructionsTooLong') ||
           `Instructions too long (max ${MAX_INSTRUCTIONS_LENGTH} characters)`;
  }
  return true;
};

/**
 * Interactive setup wizard for coParrot
 */
export async function setup() {
  showBanner('Welcome to coParrot!', 'Let\'s get you set up. This will only take a minute.');

  try {
    const language = await selectLanguage();
    i18n.setLanguage(language);

    console.clear();
    showBanner(i18n.t('setup.welcome'), i18n.t('setup.intro'));

    const provider = await selectProvider();
    const { apiKey, ollamaUrl } = await promptProviderCredentials(provider);
    const model = await selectModel(provider, ollamaUrl);
    const convention = await selectConvention();
    const prTemplate = await detectPRTemplate();
    const customInstructions = await promptCustomInstructions();

    showSuccess(i18n.t('setup.setupComplete'));

    return buildSetupConfig({
      language,
      provider,
      apiKey,
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
export async function setupStep(step) {
  const config = loadConfig();
  console.log();

  try {
    const stepHandlers = {
      [SETUP_STEPS.LANGUAGE]: async () => {
        const language = await selectLanguage();
        i18n.setLanguage(language);
        return { language };
      },

      [SETUP_STEPS.PROVIDER]: async () => {
        const provider = await selectProvider();
        const { apiKey, ollamaUrl } = await promptProviderCredentials(provider);
        const model = await selectModel(provider, ollamaUrl);
        return { provider, apiKey, ollamaUrl, model };
      },

      [SETUP_STEPS.MODEL]: async () => {
        if (!config.provider) {
          showError('No provider configured.', 'Run "setup provider" first.');
          return null;
        }
        const model = await selectModel(config.provider, config.ollamaUrl);
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
      showSuccess('Configuration updated successfully!');
    }
  } catch (error) {
    if (error.name === 'ExitPromptError') {
      console.log();
      console.log(chalk.yellow('Setup cancelled.'));
    } else {
      throw error;
    }
  }
}

// Step implementations
async function selectLanguage() {
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

async function selectProvider() {
  console.log();

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

async function promptProviderCredentials(provider) {
  if (provider === 'ollama') {
    const ollamaUrl = await promptOllamaUrl();
    return { apiKey: null, ollamaUrl };
  }

  const apiKey = await promptApiKey(provider);
  return { apiKey, ollamaUrl: null };
}

async function promptApiKey(provider) {
  console.log();

  const apiKeyUrls = {
    openai: i18n.t('setup.apiKeyHelpUrls.openai'),
    claude: i18n.t('setup.apiKeyHelpUrls.claude'),
    gemini: i18n.t('setup.apiKeyHelpUrls.gemini')
  };

  console.log(chalk.dim('  ' + i18n.t('setup.apiKeyHelp', {
    url: chalk.cyan(apiKeyUrls[provider])
  })));
  console.log();

  const apiKey = await password({
    message: i18n.t('setup.enterApiKey', { provider: chalk.bold(provider) }),
    mask: '•',
    validate: validateApiKey
  }, {
    clearPromptOnDone: true
  });

  return apiKey.trim();
}

async function promptOllamaUrl() {
  const url = await input({
    message: `Enter your Ollama URL (default: ${DEFAULT_OLLAMA_URL}): `,
    default: DEFAULT_OLLAMA_URL
  }, {
    clearPromptOnDone: true
  });

  return url.trim();
}

async function selectModel(provider, ollamaUrl = null) {
  console.log();

  if (provider === 'ollama') {
    return await selectOllamaModel(ollamaUrl);
  }

  return await promptModelName(provider);
}

async function selectOllamaModel(ollamaUrl) {
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

async function fetchOllamaModels(ollamaUrl) {
  const response = await axios.get(`${ollamaUrl}/api/tags`);
  return response.data.models || [];
}

async function promptModelName(provider, defaultModel = null) {
  const model = await input({
    message: `Enter model name for ${provider}:`,
    default: defaultModel || DEFAULT_MODELS[provider] || ''
  }, {
    clearPromptOnDone: true
  });

  return model.trim();
}

async function selectConvention() {
  console.log();

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

async function promptCustomConvention() {
  console.log();
  console.log(chalk.dim('  ' + i18n.t('setup.customCommitHelp')));
  console.log();

  const customFormat = await editor({
    message: i18n.t('setup.enterCustomCommit'),
    default: i18n.t('setup.customCommitExample'),
    waitForUseInput: false,
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

export async function detectPRTemplate() {
  for (const templatePath of PR_TEMPLATE_PATHS) {
    if (fs.existsSync(templatePath)) {
      console.log(chalk.green('  ✓ Found PR template: ') + chalk.dim(templatePath));
      return { path: templatePath, style: 'template' };
    }
  }

  return { path: null, style: 'detailed' };
}

async function promptCustomInstructions() {
  console.log();

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
    waitForUseInput: false,
    validate: validateInstructions
  }, {
    clearPromptOnDone: true
  });

  return instructions.trim();
}

function buildSetupConfig({
  language,
  provider,
  apiKey,
  ollamaUrl,
  model,
  convention,
  prTemplate,
  customInstructions
}) {
  return {
    language,
    provider,
    apiKey,
    ollamaUrl,
    model,
    commitConvention: convention,
    prTemplatePath: prTemplate.path,
    prMessageStyle: prTemplate.style,
    customInstructions
  };
}
