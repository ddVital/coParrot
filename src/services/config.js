import fs from 'fs';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import { setup } from '../commands/setup.js';
import i18n from './i18n.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'coparrot');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

/**
 * Default configuration structure
 */
const DEFAULT_CONFIG = {
  language: 'en',
  provider: null,
  model: null,
  apiKey: null,
  commitConvention: 'conventional',
  codeReviewStyle: 'detailed',
  prMessageStyle: 'detailed',
  customInstructions: ''
};

/**
 * Load configuration from disk
 * @returns {Object} Configuration object
 */
export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(data);

    // Merge with defaults to ensure all keys exist
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Initialize i18n with the configured language
    i18n.initialize(mergedConfig.language);

    return mergedConfig;
  } catch (err) {
    console.error(chalk.red('⚠ ') + i18n.t('config.errors.readError', { error: err.message }));
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
    // Ensure required fields
    const configToSave = {
      ...DEFAULT_CONFIG,
      ...data
    };

    // Create config directory if it doesn't exist
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Write config file with pretty formatting
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configToSave, null, 2), 'utf-8');

    // Update i18n language if changed
    if (configToSave.language !== i18n.getLanguage()) {
      i18n.setLanguage(configToSave.language);
    }

    return true;
  } catch (err) {
    console.error(chalk.red('⚠ ') + i18n.t('config.errors.saveError', { error: err.message }));
    return false;
  }
}

/**
 * Run the interactive setup wizard and save configuration
 * @returns {Promise<boolean>} Success status
 */
export async function setupConfig() {
  try {
    // Run interactive setup
    const preferences = await setup();

    // Load existing config (if any) and merge with new preferences
    const existingConfig = loadConfig();
    const newConfig = { ...existingConfig, ...preferences };

    // Save configuration
    const saved = saveConfig(newConfig);

    if (saved) {
      console.log();
      console.log(chalk.green('✓ ') + i18n.t('setup.configSaved', { path: chalk.dim(CONFIG_PATH) }));
      console.log();
      console.log(chalk.cyan('  ' + i18n.t('setup.readyToGo')));
      console.log();

      // Wait a moment before starting the app
      await new Promise(resolve => setTimeout(resolve, 1500));

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
  return !!(
    config &&
    config.provider &&
    config.apiKey &&
    config.language
  );
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
  return config.language || 'en';
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
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
    return true;
  } catch (err) {
    console.error(chalk.red('⚠ ') + 'Failed to reset config:', err.message);
    return false;
  }
}
