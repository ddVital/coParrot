import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock platform before module load
vi.mock('../../../src/utils/platform.js', () => ({
  getConfigDir: vi.fn().mockReturnValue('/mock/config'),
  isWindows: false,
}))

// Mock i18n to avoid filesystem path issues
vi.mock('../../../src/services/i18n.js', () => ({
  default: {
    initialize: vi.fn(),
    t: vi.fn().mockReturnValue(''),
    getLanguage: vi.fn().mockReturnValue('en'),
    setLanguage: vi.fn(),
  },
}))

// Mock setup command to avoid loading its heavy dependencies
vi.mock('../../../src/commands/setup.js', () => ({
  setup: vi.fn().mockResolvedValue({ provider: 'openai', apiKey: 'test' }),
}))

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

vi.mock('fs', () => ({
  default: fsMocks,
  ...fsMocks,
}))

import {
  loadConfig,
  saveConfig,
  resolveApiKey,
  isConfigValid,
  getEnvVarForProvider,
} from '../../../src/services/config.js'
import type { AppConfig } from '../../../src/services/config.js'

const validConfig: AppConfig = {
  language: 'en',
  provider: 'openai',
  model: 'gpt-4',
  apiKey: 'sk-test-key',
  ollamaUrl: null,
  commitConvention: { type: 'conventional', format: null, verboseCommits: false },
  prTemplatePath: null,
  prMessageStyle: 'detailed',
  customInstructions: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset environment variables
  delete process.env.OPENAI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
})

describe('loadConfig', () => {
  it('returns defaults when config file is absent', () => {
    fsMocks.existsSync.mockReturnValue(false)
    const config = loadConfig()
    expect(config.language).toBe('en')
    expect(config.provider).toBeNull()
    expect(config.apiKey).toBeNull()
  })

  it('parses and merges config from file', () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.readFileSync.mockReturnValue(
      JSON.stringify({ provider: 'openai', apiKey: 'sk-key', language: 'en' })
    )
    const config = loadConfig()
    expect(config.provider).toBe('openai')
    expect(config.apiKey).toBe('sk-key')
  })

  it('returns defaults on JSON parse error', () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.readFileSync.mockReturnValue('not-valid-json{{{')
    const config = loadConfig()
    expect(config.provider).toBeNull()
  })

  it('merges with defaults so missing fields get filled', () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({ provider: 'openai' }))
    const config = loadConfig()
    // Missing fields should have default values
    expect(config.prMessageStyle).toBe('detailed')
    expect(config.commitConvention.type).toBe('conventional')
  })
})

describe('saveConfig', () => {
  it('writes JSON to disk and returns true', () => {
    fsMocks.existsSync.mockReturnValue(true) // config dir exists
    fsMocks.writeFileSync.mockImplementation(() => {})
    fsMocks.chmodSync.mockImplementation(() => {})
    const result = saveConfig(validConfig)
    expect(result).toBe(true)
    expect(fsMocks.writeFileSync).toHaveBeenCalled()
  })

  it('returns false on write error', () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.writeFileSync.mockImplementation(() => {
      throw new Error('disk full')
    })
    const result = saveConfig(validConfig)
    expect(result).toBe(false)
  })

  it('creates config dir if absent', () => {
    fsMocks.existsSync.mockReturnValue(false)
    fsMocks.mkdirSync.mockImplementation(() => {})
    fsMocks.writeFileSync.mockImplementation(() => {})
    fsMocks.chmodSync.mockImplementation(() => {})
    saveConfig(validConfig)
    expect(fsMocks.mkdirSync).toHaveBeenCalled()
  })
})

describe('resolveApiKey', () => {
  it('env var overrides config value', () => {
    process.env.OPENAI_API_KEY = 'env-key'
    expect(resolveApiKey('openai', 'config-key')).toBe('env-key')
  })

  it('returns config value when env var absent', () => {
    expect(resolveApiKey('openai', 'config-key')).toBe('config-key')
  })

  it('returns null when both env and config absent', () => {
    expect(resolveApiKey('openai', null)).toBeNull()
  })

  it('GOOGLE_API_KEY fallback for gemini', () => {
    process.env.GOOGLE_API_KEY = 'google-key'
    expect(resolveApiKey('gemini', null)).toBe('google-key')
  })

  it('GEMINI_API_KEY preferred over GOOGLE_API_KEY for gemini', () => {
    process.env.GEMINI_API_KEY = 'gemini-key'
    process.env.GOOGLE_API_KEY = 'google-key'
    expect(resolveApiKey('gemini', null)).toBe('gemini-key')
  })

  it('empty string env var is ignored — falls back to config key', () => {
    // Empty string is falsy; the secure flow skips it and uses the stored config key
    process.env.OPENAI_API_KEY = ''
    expect(resolveApiKey('openai', 'config-key')).toBe('config-key')
  })

  it('null provider returns config key unchanged', () => {
    // When provider is null there is no env var to check
    expect(resolveApiKey(null, 'config-key')).toBe('config-key')
  })

  it('ollama provider (not in env map) returns config key unchanged', () => {
    expect(resolveApiKey('ollama', 'some-value')).toBe('some-value')
  })

  it('env key is preferred even when config key also present (env wins)', () => {
    process.env.ANTHROPIC_API_KEY = 'ant-env-key'
    // Simulates: user previously stored key in config, later set env var
    // The env var must win — config key must NOT reach the SDK
    const result = resolveApiKey('claude', 'old-stored-config-key')
    expect(result).toBe('ant-env-key')
    expect(result).not.toBe('old-stored-config-key')
  })
})

describe('isConfigValid', () => {
  it('returns true for complete valid config', () => {
    expect(isConfigValid(validConfig)).toBe(true)
  })

  it('returns false when provider is null', () => {
    const cfg = { ...validConfig, provider: null }
    expect(isConfigValid(cfg)).toBe(false)
  })

  it('returns false when API key missing and no env var', () => {
    const cfg = { ...validConfig, apiKey: null }
    expect(isConfigValid(cfg)).toBe(false)
  })

  it('returns true for ollama with URL', () => {
    const cfg: AppConfig = {
      ...validConfig,
      provider: 'ollama',
      apiKey: null,
      ollamaUrl: 'http://localhost:11434',
    }
    expect(isConfigValid(cfg)).toBe(true)
  })

  it('returns false for ollama without URL', () => {
    const cfg: AppConfig = {
      ...validConfig,
      provider: 'ollama',
      apiKey: null,
      ollamaUrl: null,
    }
    expect(isConfigValid(cfg)).toBe(false)
  })

  it('returns true when apiKey is null in config but env var is set (secure flow)', () => {
    // The "new secure implementation": user does not store the API key in config.json —
    // resolveApiKey() finds it in the env var, so the config is still considered valid.
    process.env.OPENAI_API_KEY = 'env-only-key'
    const cfg: AppConfig = { ...validConfig, apiKey: null }
    expect(isConfigValid(cfg)).toBe(true)
  })

  it('returns false when apiKey is null in config AND env var is absent', () => {
    const cfg: AppConfig = { ...validConfig, apiKey: null }
    expect(isConfigValid(cfg)).toBe(false)
  })

  it('returns true for claude provider when ANTHROPIC_API_KEY is set without stored key', () => {
    process.env.ANTHROPIC_API_KEY = 'ant-env-key'
    const cfg: AppConfig = { ...validConfig, provider: 'claude', apiKey: null }
    expect(isConfigValid(cfg)).toBe(true)
  })
})

describe('getEnvVarForProvider', () => {
  it('returns var name when env var is set', () => {
    process.env.OPENAI_API_KEY = 'test-key'
    expect(getEnvVarForProvider('openai')).toBe('OPENAI_API_KEY')
  })

  it('returns null when env var not set', () => {
    expect(getEnvVarForProvider('openai')).toBeNull()
  })

  it('returns null for unknown provider', () => {
    expect(getEnvVarForProvider('unknown-provider')).toBeNull()
  })

  it('returns ANTHROPIC_API_KEY for claude provider', () => {
    process.env.ANTHROPIC_API_KEY = 'ant-key'
    expect(getEnvVarForProvider('claude')).toBe('ANTHROPIC_API_KEY')
  })
})
