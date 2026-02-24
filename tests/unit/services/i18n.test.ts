import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '../../../src/services/i18n.js'

// We manipulate the singleton's state directly to avoid filesystem path issues
// (i18n.ts path calculation assumes compiled dist/ structure)

beforeEach(() => {
  i18n.translations = {
    en: {
      greeting: 'Hello {name}',
      simple: 'Simple string',
      count: {
        singular: 'One item',
        plural: '{count} items',
      },
      nested: {
        deep: {
          value: 'Deep value',
        },
      },
    } as Record<string, unknown>,
    es: {
      simple: 'Cadena simple',
      greeting: 'Hola {name}',
    } as Record<string, unknown>,
  }
  i18n.currentLanguage = 'en'
})

describe('getSupportedLanguage', () => {
  it('returns exact match for supported language', () => {
    expect(i18n.getSupportedLanguage('en')).toBe('en')
    expect(i18n.getSupportedLanguage('es')).toBe('es')
    expect(i18n.getSupportedLanguage('pt-BR')).toBe('pt-BR')
  })

  it('uses prefix match (pt → pt-BR)', () => {
    expect(i18n.getSupportedLanguage('pt')).toBe('pt-BR')
  })

  it('falls back to en for unsupported language', () => {
    expect(i18n.getSupportedLanguage('fr')).toBe('en')
    expect(i18n.getSupportedLanguage('zh-CN')).toBe('en')
  })
})

describe('t', () => {
  it('returns translated string for valid key', () => {
    expect(i18n.t('simple')).toBe('Simple string')
  })

  it('interpolates {param} placeholders', () => {
    expect(i18n.t('greeting', { name: 'Alice' })).toBe('Hello Alice')
  })

  it('returns key for missing translation', () => {
    expect(i18n.t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('uses fallback language when key missing in current language', () => {
    i18n.currentLanguage = 'es'
    // 'nested.deep.value' exists only in 'en'
    expect(i18n.t('nested.deep.value')).toBe('Deep value')
  })

  it('accesses nested keys via dot notation', () => {
    expect(i18n.t('nested.deep.value')).toBe('Deep value')
  })
})

describe('interpolate', () => {
  it('replaces single placeholder', () => {
    expect(i18n.interpolate('Hello {name}', { name: 'Bob' })).toBe('Hello Bob')
  })

  it('replaces multiple placeholders', () => {
    expect(i18n.interpolate('{a} and {b}', { a: 'X', b: 'Y' })).toBe('X and Y')
  })

  it('leaves unmatched placeholders unchanged', () => {
    expect(i18n.interpolate('Hello {name}', {})).toBe('Hello {name}')
  })

  it('handles string with no placeholders', () => {
    expect(i18n.interpolate('No placeholders', { foo: 'bar' })).toBe('No placeholders')
  })
})

describe('plural', () => {
  it('uses singular key when count is 1', () => {
    expect(i18n.plural('count', 1)).toBe('One item')
  })

  it('uses plural key when count is not 1', () => {
    expect(i18n.plural('count', 0)).toBe('0 items')
    expect(i18n.plural('count', 5)).toBe('5 items')
  })
})

describe('getNestedValue', () => {
  it('accesses deeply nested value', () => {
    const obj = { a: { b: { c: 'deep' } } } as Record<string, unknown>
    expect(i18n.getNestedValue(obj, 'a.b.c')).toBe('deep')
  })

  it('returns undefined for missing path', () => {
    const obj = { a: { b: 'value' } } as Record<string, unknown>
    expect(i18n.getNestedValue(obj, 'a.x.y')).toBeUndefined()
  })

  it('returns undefined for undefined object', () => {
    expect(i18n.getNestedValue(undefined, 'any.key')).toBeUndefined()
  })

  it('returns top-level value for single key', () => {
    const obj = { greeting: 'Hello' } as Record<string, unknown>
    expect(i18n.getNestedValue(obj, 'greeting')).toBe('Hello')
  })
})

describe('setLanguage', () => {
  it('changes current language', () => {
    i18n.setLanguage('es')
    expect(i18n.getLanguage()).toBe('es')
  })

  it('normalizes unsupported language to fallback', () => {
    i18n.setLanguage('fr')
    expect(i18n.getLanguage()).toBe('en')
  })
})
