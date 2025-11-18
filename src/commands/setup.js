import { select, password, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import i18n from '../services/i18n.js';

/**
 * Interactive setup wizard for coParrot
 * Guides users through initial configuration with a friendly UX
 */
export async function setup() {
  // Show welcome banner
  console.log();
  console.log(chalk.cyan.bold('═'.repeat(60)));
  console.log(chalk.cyan.bold(`  ${i18n.t('setup.welcome')}`));
  console.log(chalk.dim(`  ${i18n.t('setup.intro')}`));
  console.log(chalk.cyan.bold('═'.repeat(60)));
  console.log();

  try {
    // Step 1: Language Selection
    const language = await selectLanguage();

    // Reinitialize i18n with selected language
    i18n.setLanguage(language);

    // Step 2: LLM Provider Selection
    const provider = await selectProvider();

    // Step 3: API Key Input
    const apiKey = await promptApiKey(provider);

    // Step 4: Optional Model Selection (can be expanded later)
    const model = getDefaultModel(provider);

    console.log();
    console.log(chalk.green('✓ ') + chalk.white(i18n.t('setup.setupComplete')));
    console.log();

    return {
      language,
      provider,
      apiKey,
      model
    };

  } catch (error) {
    if (error.name === 'ExitPromptError') {
      // User cancelled setup
      console.log();
      console.log(chalk.yellow('Setup cancelled.'));
      process.exit(0);
    }
    throw error;
  }
}

/**
 * Language selection step
 */
async function selectLanguage() {
  const language = await select({
    message: i18n.t('setup.selectLanguage'),
    choices: [
      {
        name: '🇺🇸 English',
        value: 'en',
        description: 'English language'
      },
      {
        name: '🇧🇷 Português (Brasil)',
        value: 'pt-BR',
        description: 'Brazilian Portuguese'
      },
      {
        name: '🇪🇸 Español',
        value: 'es',
        description: 'Spanish language'
      }
    ],
    default: 'en'
  });

  return language;
}

/**
 * Provider selection step with descriptions
 */
async function selectProvider() {
  console.log();

  const provider = await select({
    message: i18n.t('setup.selectProvider'),
    choices: [
      {
        name: i18n.t('setup.providers.openai'),
        value: 'openai',
        description: i18n.t('setup.providers.openaiDesc')
      },
      {
        name: i18n.t('setup.providers.claude'),
        value: 'claude',
        description: i18n.t('setup.providers.claudeDesc')
      },
      {
        name: i18n.t('setup.providers.gemini'),
        value: 'gemini',
        description: i18n.t('setup.providers.geminiDesc')
      }
    ]
  });

  return provider;
}

/**
 * API Key input with helper text
 */
async function promptApiKey(provider) {
  console.log();

  // Show helpful link to get API key
  const urls = {
    'openai': i18n.t('setup.apiKeyHelpUrls.openai'),
    'claude': i18n.t('setup.apiKeyHelpUrls.claude'),
    'gemini': i18n.t('setup.apiKeyHelpUrls.gemini')
  };

  console.log(chalk.dim('  ' + i18n.t('setup.apiKeyHelp', { url: chalk.cyan(urls[provider]) })));
  console.log();

  const apiKey = await password({
    message: i18n.t('setup.enterApiKey', { provider: chalk.bold(provider) }),
    mask: '•',
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return 'API key cannot be empty';
      }
      if (value.trim().length < 10) {
        return 'API key seems too short. Please check and try again.';
      }
      return true;
    }
  });

  return apiKey.trim();
}

/**
 * Get default model for provider
 */
function getDefaultModel(provider) {
  const defaultModels = {
    'openai': 'gpt-4',
    'claude': 'claude-3-5-sonnet-20241022',
    'gemini': 'gemini-pro'
  };

  return defaultModels[provider] || 'default';
}

/**
 * Test API connection (optional, can be implemented later)
 */
async function testConnection(provider, apiKey, model) {
  console.log();
  console.log(chalk.dim('  ' + i18n.t('setup.testing', { provider })));

  // TODO: Implement actual API test
  // For now, just simulate
  await new Promise(resolve => setTimeout(resolve, 1000));

  return true;
}

