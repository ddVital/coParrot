import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type TranslationValue = string | Record<string, unknown>;
type Translations = Record<string, Record<string, unknown>>;

/**
 * Simple i18n service for coParrot
 * Supports multiple languages with fallback to English
 */
class I18nService {
  translations: Translations;
  currentLanguage: string;
  supportedLanguages: string[];
  fallbackLanguage: string;

  constructor() {
    this.translations = {};
    this.currentLanguage = 'en';
    this.supportedLanguages = ['en', 'pt-BR', 'es'];
    this.fallbackLanguage = 'en';
  }

  /**
   * Initialize the i18n service with a specific language
   */
  initialize(language: string = 'en'): void {
    this.currentLanguage = this.getSupportedLanguage(language);
    this.loadTranslations(this.currentLanguage);

    // Also load fallback language if different
    if (this.currentLanguage !== this.fallbackLanguage) {
      this.loadTranslations(this.fallbackLanguage);
    }
  }

  /**
   * Validate and normalize language code
   */
  getSupportedLanguage(language: string): string {
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
   */
  loadTranslations(language: string): void {
    try {
      const localesPath = join(__dirname, '..', '..', '..', 'locales', `${language}.json`);
      const content = readFileSync(localesPath, 'utf8');
      this.translations[language] = JSON.parse(content);
    } catch (error) {
      if (language === this.fallbackLanguage) {
        const err = error as Error;
        console.error(`Failed to load fallback language ${language}:`, err.message);
        this.translations[language] = {};
      }
    }
  }

  /**
   * Get a translated string by key
   */
  t(key: string, params: Record<string, unknown> = {}): string {
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
    return this.interpolate(value as string, params);
  }

  /**
   * Get nested object value using dot notation
   */
  getNestedValue(obj: Record<string, unknown> | undefined, key: string): unknown {
    if (!obj) return undefined;

    const keys = key.split('.');
    let result: unknown = obj;

    for (const k of keys) {
      if (result && typeof result === 'object' && k in (result as Record<string, unknown>)) {
        result = (result as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }

    return result;
  }

  /**
   * Interpolate parameters into a string
   */
  interpolate(str: string, params: Record<string, unknown>): string {
    if (typeof str !== 'string') {
      return str;
    }

    return str.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? String(params[key]) : match;
    });
  }

  /**
   * Get plural form based on count
   */
  plural(key: string, count: number, params: Record<string, unknown> = {}): string {
    const pluralKey = count === 1 ? `${key}.singular` : `${key}.plural`;
    return this.t(pluralKey, { ...params, count });
  }

  /**
   * Change the current language
   */
  setLanguage(language: string): void {
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
   */
  getLanguage(): string {
    return this.currentLanguage;
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages(): string[] {
    return [...this.supportedLanguages];
  }

  /**
   * Get language name in its native form
   */
  getLanguageName(code: string): string {
    const names: Record<string, string> = {
      'en': 'English',
      'pt-BR': 'Português (Brasil)',
      'es': 'Español'
    };
    return names[code] || code;
  }
}

// Export singleton instance
export default new I18nService();
