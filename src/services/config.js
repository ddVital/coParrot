import fs from 'fs';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import { setup } from '../commands/setup.js';
import i18n from './i18n.js';

// Constants
const CONFIG_DIR = path.join(os.homedir(), '.config', 'coparrot');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const CONFIG_ENCODING = 'utf-8';
const JSON_INDENT = 2;
const SETUP_DELAY_MS = 1500;

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_PR_STYLE = 'detailed';
const DEFAULT_CONVENTION_TYPE = 'conventional';

const PROVIDER = {
  OLLAMA: 'ollama'
};

/**
 * Default configuration structure
 */
const DEFAULT_CONFIG = {
  language: DEFAULT_LANGUAGE,
  provider: null,
  model: null,
  apiKey: null,
  ollamaUrl: null,
  commitConvention: {
    type: DEFAULT_CONVENTION_TYPE,
    format: null,
    verboseCommits: false
  },
  prTemplatePath: null,
  prMessageStyle: DEFAULT_PR_STYLE,
  customInstructions: ''
};

// File system helpers
const ensureConfigDir = () => {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
};

const configExists = () => fs.existsSync(CONFIG_PATH);

const readConfigFile = () => {
  const data = fs.readFileSync(CONFIG_PATH, CONFIG_ENCODING);
  return JSON.parse(data);
};

const writeConfigFile = (config) => {
  ensureConfigDir();
  const data = JSON.stringify(config, null, JSON_INDENT);
  fs.writeFileSync(CONFIG_PATH, data, CONFIG_ENCODING);
};

// Validation helpers
const hasRequiredFields = (config) => {
  return config?.provider && config?.language;
};

const hasValidCredentials = (config) => {
  if (config.provider === PROVIDER.OLLAMA) {
    return !!config.ollamaUrl;
  }
  return !!config.apiKey;
};

// Error handling
const showConfigError = (action, error) => {
  const errorKey = `config.errors.${action}Error`;
  const message = i18n.t(errorKey, { error: error.message });
  console.error(chalk.red('⚠ ') + message);
};

const showSetupSuccess = (configPath) => {
  console.log();
  console.log(chalk.green('✓ ') + i18n.t('setup.configSaved', {
    path: chalk.dim(configPath)
  }));
  console.log();
  console.log(chalk.cyan('  ' + i18n.t('setup.readyToGo')));
  console.log();
};

/**
 * Load configuration from disk
 * @returns {Object} Configuration object
 */
export function loadConfig() {
  if (!configExists()) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const config = readConfigFile();
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Initialize i18n with the configured language
    i18n.initialize(mergedConfig.language);

    return mergedConfig;
  } catch (error) {
    showConfigError('read', error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to disk
 * @param {Object} data - Configuration data to save
 * @returns {boolean} Success status
 */
export function saveConfig(data) {
  try {
    const configToSave = {
      ...DEFAULT_CONFIG,
      ...data
    };

    writeConfigFile(configToSave);

    // Update i18n language if changed
    if (configToSave.language !== i18n.getLanguage()) {
      i18n.setLanguage(configToSave.language);
    }

    return true;
  } catch (error) {
    showConfigError('save', error);
    return false;
  }
}

/**
 * Run the interactive setup wizard and save configuration
 * @returns {Promise<boolean>} Success status
 */
export async function setupConfig() {
  try {
    const preferences = await setup();
    const existingConfig = loadConfig();
    const newConfig = { ...existingConfig, ...preferences };

    const saved = saveConfig(newConfig);

    if (saved) {
      showSetupSuccess(CONFIG_PATH);
      await new Promise(resolve => setTimeout(resolve, SETUP_DELAY_MS));
      return true;
    }

    return false;
  } catch (error) {
    console.error(chalk.red('\n✗ ') + i18n.t('setup.setupFailed'));
    console.error(chalk.dim('  ' + error.message));
    return false;
  }
}

/**
 * Check if configuration is valid and complete
 * @param {Object} config - Configuration object to validate
 * @returns {boolean} True if valid
 */
export function isConfigValid(config) {
  return hasRequiredFields(config) && hasValidCredentials(config);
}

/**
 * Get configuration file path
 * @returns {string} Path to config file
 */
export function getConfigPath() {
  return CONFIG_PATH;
}

/**
 * Get the current language from config
 * @returns {string} Language code
 */
export function getLanguage() {
  const config = loadConfig();
  return config.language || DEFAULT_LANGUAGE;
}

/**
 * Set the language in config
 * @param {string} language - Language code
 */
export function setLanguage(language) {
  const config = loadConfig();
  config.language = language;
  saveConfig(config);
}

/**
 * Reset configuration (delete config file)
 * @returns {boolean} Success status
 */
export function resetConfig() {
  try {
    if (configExists()) {
      fs.unlinkSync(CONFIG_PATH);
    }
    return true;
  } catch (error) {
    console.error(chalk.red('⚠ ') + 'Failed to reset config:', error.message);
    return false;
  }
}
