import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Simple i18n service for coParrot
 * Supports multiple languages with fallback to English
 */
class I18nService {
  constructor() {
    this.translations = {};
    this.currentLanguage = 'en';
    this.supportedLanguages = ['en', 'pt-BR', 'es'];
    this.fallbackLanguage = 'en';
  }

  /**
   * Initialize the i18n service with a specific language
   * @param {string} language - Language code (e.g., 'en', 'pt-BR', 'es')
   */
  initialize(language = 'en') {
    this.currentLanguage = this.getSupportedLanguage(language);
    this.loadTranslations(this.currentLanguage);

    // Also load fallback language if different
    if (this.currentLanguage !== this.fallbackLanguage) {
      this.loadTranslations(this.fallbackLanguage);
    }
  }

  /**
   * Validate and normalize language code
   * @param {string} language - Language code
   * @returns {string} Supported language code or fallback
   */
  getSupportedLanguage(language) {
    if (this.supportedLanguages.includes(language)) {
      return language;
    }

    // Try to match language prefix (e.g., 'pt' -> 'pt-BR')
    const prefix = language.split('-')[0];
    const match = this.supportedLanguages.find(lang => lang.startsWith(prefix));

    return match || this.fallbackLanguage;
  }

  /**
   * Load translations for a specific language
   * @param {string} language - Language code
   */
  loadTranslations(language) {
    try {
      const localesPath = join(__dirname, '..', '..', 'locales', `${language}.json`);
      const content = readFileSync(localesPath, 'utf8');
      this.translations[language] = JSON.parse(content);
    } catch (error) {
      if (language === this.fallbackLanguage) {
        console.error(`Failed to load fallback language ${language}:`, error.message);
        this.translations[language] = {};
      }
    }
  }

  /**
   * Get a translated string by key
   * @param {string} key - Translation key (supports dot notation, e.g., 'cli.commands.help')
   * @param {Object} params - Parameters for string interpolation
   * @returns {string} Translated string
   */
  t(key, params = {}) {
    let value = this.getNestedValue(this.translations[this.currentLanguage], key);

    // Fallback to default language if not found
    if (value === undefined && this.currentLanguage !== this.fallbackLanguage) {
      value = this.getNestedValue(this.translations[this.fallbackLanguage], key);
    }

    // Return key if translation not found
    if (value === undefined) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }

    // Handle interpolation
    return this.interpolate(value, params);
  }

  /**
   * Get nested object value using dot notation
   * @param {Object} obj - Object to search
   * @param {string} key - Dot-notation key
   * @returns {*} Value or undefined
   */
  getNestedValue(obj, key) {
    if (!obj) return undefined;

    const keys = key.split('.');
    let result = obj;

    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = result[k];
      } else {
        return undefined;
      }
    }

    return result;
  }

  /**
   * Interpolate parameters into a string
   * @param {string} str - Template string with {param} placeholders
   * @param {Object} params - Parameters to interpolate
   * @returns {string} Interpolated string
   */
  interpolate(str, params) {
    if (typeof str !== 'string') {
      return str;
    }

    return str.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  /**
   * Get plural form based on count
   * @param {string} key - Translation key
   * @param {number} count - Count for plural logic
   * @param {Object} params - Additional parameters
   * @returns {string} Translated string in correct plural form
   */
  plural(key, count, params = {}) {
    const pluralKey = count === 1 ? `${key}.singular` : `${key}.plural`;
    return this.t(pluralKey, { ...params, count });
  }

  /**
   * Change the current language
   * @param {string} language - New language code
   */
  setLanguage(language) {
    const newLanguage = this.getSupportedLanguage(language);

    if (newLanguage !== this.currentLanguage) {
      this.currentLanguage = newLanguage;
      if (!this.translations[newLanguage]) {
        this.loadTranslations(newLanguage);
      }
    }
  }

  /**
   * Get current language
   * @returns {string} Current language code
   */
  getLanguage() {
    return this.currentLanguage;
  }

  /**
   * Get list of supported languages
   * @returns {Array<string>} Supported language codes
   */
  getSupportedLanguages() {
    return [...this.supportedLanguages];
  }

  /**
   * Get language name in its native form
   * @param {string} code - Language code
   * @returns {string} Native language name
   */
  getLanguageName(code) {
    const names = {
      'en': 'English',
      'pt-BR': 'Português (Brasil)',
      'es': 'Español'
    };
    return names[code] || code;
  }
}

// Export singleton instance
export default new I18nService();
