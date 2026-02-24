import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { setup } from '../commands/setup.js';
import i18n from './i18n.js';
import { getConfigDir, isWindows } from '../utils/platform.js';

// Types
export interface CommitConvention {
  type: string;
  format: string | null;
  verboseCommits: boolean;
}

export interface AppConfig {
  language: string;
  provider: string | null;
  model: string | null;
  apiKey: string | null;
  ollamaUrl: string | null;
  commitConvention: CommitConvention;
  prTemplatePath: string | null;
  prMessageStyle: string;
  customInstructions: string;
}

// Constants
const CONFIG_DIR = getConfigDir();
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const CONFIG_ENCODING: BufferEncoding = 'utf-8';
const JSON_INDENT = 2;
const SETUP_DELAY_MS = 1500;

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_PR_STYLE = 'detailed';
const DEFAULT_CONVENTION_TYPE = 'conventional';

const PROVIDER = {
  OLLAMA: 'ollama'
} as const;

const ENV_VAR_MAP: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY'],
  claude: ['ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY']
};

/**
 * Default configuration structure
 */
const DEFAULT_CONFIG: AppConfig = {
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

const readConfigFile = (): AppConfig => {
  const data = fs.readFileSync(CONFIG_PATH, CONFIG_ENCODING);
  return JSON.parse(data) as AppConfig;
};

const writeConfigFile = (config: AppConfig): void => {
  ensureConfigDir();
  const data = JSON.stringify(config, null, JSON_INDENT);
  fs.writeFileSync(CONFIG_PATH, data, { encoding: CONFIG_ENCODING, mode: 0o600 });
  if (!isWindows) {
    fs.chmodSync(CONFIG_PATH, 0o600);
  }
};

// Validation helpers
const hasRequiredFields = (config: AppConfig | null): boolean => {
  return !!(config?.provider && config?.language);
};

const hasValidCredentials = (config: AppConfig): boolean => {
  if (config.provider === PROVIDER.OLLAMA) {
    return !!config.ollamaUrl;
  }
  return !!resolveApiKey(config.provider, config.apiKey);
};

// Error handling
const showConfigError = (action: string, error: Error): void => {
  const errorKey = `config.errors.${action}Error`;
  const message = i18n.t(errorKey, { error: error.message });
  console.error(chalk.red('⚠ ') + message);
};

const showSetupSuccess = (configPath: string): void => {
  console.log();
  console.log(chalk.green('✓ ') + i18n.t('setup.configSaved', {
    path: chalk.dim(configPath)
  }));
  console.log();
  console.log(chalk.cyan('  ' + i18n.t('setup.readyToGo')));
  console.log();
};

/**
 * Resolve API key: checks environment variables first, falls back to config value
 */
export function resolveApiKey(provider: string | null, configApiKey: string | null): string | null {
  if (provider) {
    const envVars = ENV_VAR_MAP[provider];
    if (envVars) {
      for (const envVar of envVars) {
        const value = process.env[envVar];
        if (value) return value;
      }
    }
  }
  return configApiKey ?? null;
}

/**
 * Returns the name of the first detected env var for a provider, or null
 */
export function getEnvVarForProvider(provider: string): string | null {
  const envVars = ENV_VAR_MAP[provider];
  if (!envVars) return null;
  for (const envVar of envVars) {
    if (process.env[envVar]) return envVar;
  }
  return null;
}

/**
 * Load configuration from disk
 */
export function loadConfig(): AppConfig {
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
    showConfigError('read', error as Error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to disk
 */
export function saveConfig(data: Partial<AppConfig>): boolean {
  try {
    const configToSave: AppConfig = {
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
    showConfigError('save', error as Error);
    return false;
  }
}

/**
 * Run the interactive setup wizard and save configuration
 */
export async function setupConfig(): Promise<boolean> {
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
    const err = error as Error;
    console.error(chalk.red('\n✗ ') + i18n.t('setup.setupFailed'));
    console.error(chalk.dim('  ' + err.message));
    return false;
  }
}

/**
 * Check if configuration is valid and complete
 */
export function isConfigValid(config: AppConfig): boolean {
  return hasRequiredFields(config) && hasValidCredentials(config);
}

/**
 * Get configuration file path
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Get the current language from config
 */
export function getLanguage(): string {
  const config = loadConfig();
  return config.language || DEFAULT_LANGUAGE;
}

/**
 * Set the language in config
 */
export function setLanguage(language: string): void {
  const config = loadConfig();
  config.language = language;
  saveConfig(config);
}

/**
 * Reset configuration (delete config file)
 */
export function resetConfig(): boolean {
  try {
    if (configExists()) {
      fs.unlinkSync(CONFIG_PATH);
    }
    return true;
  } catch (error) {
    const err = error as Error;
    console.error(chalk.red('⚠ ') + 'Failed to reset config:', err.message);
    return false;
  }
}
