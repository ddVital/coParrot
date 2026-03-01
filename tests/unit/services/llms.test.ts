import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mock handles ───────────────────────────────────────────────────
const openaiMocks = vi.hoisted(() => ({
  chatCreate: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'openai response' } }],
  }),
}))

const claudeMocks = vi.hoisted(() => ({
  messagesCreate: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'claude response' }],
  }),
}))

const geminiMocks = vi.hoisted(() => ({
  generateContent: vi.fn().mockResolvedValue({ text: 'gemini response' }),
}))

const axiosMocks = vi.hoisted(() => ({
  post: vi.fn().mockResolvedValue({ data: { response: 'ollama response' } }),
}))

const streamerMocks = vi.hoisted(() => ({
  startThinking: vi.fn(),
  stopThinking: vi.fn(),
}))

// ─── SDK mocks ──────────────────────────────────────────────────────────────
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: openaiMocks.chatCreate } },
  })),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: claudeMocks.messagesCreate },
  })),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: geminiMocks.generateContent },
  })),
}))

vi.mock('axios', () => ({
  default: { post: axiosMocks.post },
}))

vi.mock('../../../src/lib/streamer.js', () => ({
  default: vi.fn().mockImplementation(() => streamerMocks),
}))

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn().mockResolvedValue('approve'),
  input: vi.fn().mockResolvedValue(''),
}))

vi.mock('../../../src/services/i18n.js', () => ({
  default: {
    t: vi.fn().mockReturnValue(''),
    initialize: vi.fn(),
    getLanguage: vi.fn().mockReturnValue('en'),
    setLanguage: vi.fn(),
  },
}))

// ─── Imports (after mocks) ──────────────────────────────────────────────────
import LLMOrchestrator from '../../../src/services/llms.js'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import { select } from '@inquirer/prompts'

// ─── Setup ──────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  openaiMocks.chatCreate.mockResolvedValue({
    choices: [{ message: { content: 'openai response' } }],
  })
  claudeMocks.messagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'claude response' }],
  })
  geminiMocks.generateContent.mockResolvedValue({ text: 'gemini response' })
  axiosMocks.post.mockResolvedValue({ data: { response: 'ollama response' } })
  vi.mocked(select).mockResolvedValue('approve' as 'approve' | 'retry' | 'retry_with_instructions')
})

// ═══════════════════════════════════════════════════════════════════════════
// Constructor
// ═══════════════════════════════════════════════════════════════════════════

describe('Constructor', () => {
  it('defaults to openai provider', () => {
    const llm = new LLMOrchestrator({})
    expect(llm.options.provider).toBe('openai')
  })

  it('sets skipApproval from options', () => {
    const llm = new LLMOrchestrator({ provider: 'openai', skipApproval: true })
    expect(llm.options.skipApproval).toBe(true)
  })

  it('sets client to "local" for ollama', () => {
    const llm = new LLMOrchestrator({ provider: 'ollama', ollamaUrl: 'http://localhost:11434' })
    expect(llm.client).toBe('local')
  })

  it('throws for unsupported provider', () => {
    expect(() => new LLMOrchestrator({ provider: 'unsupported' as 'openai' })).toThrow(
      'Unsupported provider'
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// API key forwarding — the key resolved from env/config must reach the SDK
// ═══════════════════════════════════════════════════════════════════════════

describe('API key forwarding to SDK constructors', () => {
  it('passes apiKey to the OpenAI constructor', () => {
    new LLMOrchestrator({ provider: 'openai', apiKey: 'sk-secure-openai-key' })
    expect(vi.mocked(OpenAI)).toHaveBeenCalledWith({ apiKey: 'sk-secure-openai-key' })
  })

  it('passes apiKey to the Anthropic constructor', () => {
    new LLMOrchestrator({ provider: 'claude', apiKey: 'ant-secure-claude-key' })
    expect(vi.mocked(Anthropic)).toHaveBeenCalledWith({ apiKey: 'ant-secure-claude-key' })
  })

  it('passes apiKey to the GoogleGenAI constructor', () => {
    new LLMOrchestrator({ provider: 'gemini', apiKey: 'gmn-secure-gemini-key' })
    expect(vi.mocked(GoogleGenAI)).toHaveBeenCalledWith({ apiKey: 'gmn-secure-gemini-key' })
  })

  it('passes undefined apiKey when none supplied (no crash, SDK handles it)', () => {
    // This simulates the `resolveApiKey(...) ?? undefined` pattern from bin/index.ts
    // when neither env var nor config key is set
    new LLMOrchestrator({ provider: 'openai', apiKey: undefined })
    expect(vi.mocked(OpenAI)).toHaveBeenCalledWith({ apiKey: undefined })
  })

  it('a different key is passed to OpenAI than what was stored in config', () => {
    // Simulates: env var = 'env-key', config.apiKey = 'old-config-key'
    // resolveApiKey returns 'env-key', which is then passed to LLMOrchestrator
    new LLMOrchestrator({ provider: 'openai', apiKey: 'env-resolved-key' })
    expect(vi.mocked(OpenAI)).toHaveBeenCalledWith({ apiKey: 'env-resolved-key' })
    // Make sure the old config key did NOT reach the constructor
    expect(vi.mocked(OpenAI)).not.toHaveBeenCalledWith({ apiKey: 'old-config-key' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Model forwarding — configured model must appear in every SDK request
// ═══════════════════════════════════════════════════════════════════════════

describe('Model forwarding — OpenAI', () => {
  it('sends the configured model in the chat request', async () => {
    const llm = new LLMOrchestrator({ provider: 'openai', apiKey: 'test', model: 'gpt-3.5-turbo' })
    await llm.call({}, 'commit')
    expect(openaiMocks.chatCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-3.5-turbo' }),
      expect.anything()
    )
  })

  it('falls back to gpt-4 when no model is configured', async () => {
    const llm = new LLMOrchestrator({ provider: 'openai', apiKey: 'test' })
    await llm.call({}, 'commit')
    expect(openaiMocks.chatCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4' }),
      expect.anything()
    )
  })

  it('includes system and user messages in the request', async () => {
    const llm = new LLMOrchestrator({ provider: 'openai', apiKey: 'test' })
    await llm.call({ diff: '+ new line' }, 'commit')
    const call = openaiMocks.chatCreate.mock.calls[0][0]
    expect(call.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ])
    )
  })
})

describe('Model forwarding — Claude', () => {
  it('sends the configured model in the messages request', async () => {
    const llm = new LLMOrchestrator({ provider: 'claude', apiKey: 'test', model: 'claude-3-haiku-20240307' })
    await llm.call({}, 'commit')
    expect(claudeMocks.messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-3-haiku-20240307' }),
      expect.anything()
    )
  })

  it('falls back to claude-3-5-sonnet-20241022 when no model is configured', async () => {
    const llm = new LLMOrchestrator({ provider: 'claude', apiKey: 'test' })
    await llm.call({}, 'commit')
    expect(claudeMocks.messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-3-5-sonnet-20241022' }),
      expect.anything()
    )
  })

  it('sends system prompt and user message separately', async () => {
    const llm = new LLMOrchestrator({ provider: 'claude', apiKey: 'test' })
    await llm.call({ diff: '+ new line' }, 'commit')
    const call = claudeMocks.messagesCreate.mock.calls[0][0]
    expect(typeof call.system).toBe('string')
    expect(call.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'user' })])
    )
  })
})

describe('Model forwarding — Gemini', () => {
  it('sends the configured model in the generateContent request', async () => {
    const llm = new LLMOrchestrator({ provider: 'gemini', apiKey: 'test', model: 'gemini-1.5-pro' })
    await llm.call({}, 'commit')
    expect(geminiMocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-1.5-pro' })
    )
  })

  it('falls back to gemini-2.0-flash when no model is configured', async () => {
    const llm = new LLMOrchestrator({ provider: 'gemini', apiKey: 'test' })
    await llm.call({}, 'commit')
    expect(geminiMocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.0-flash' })
    )
  })

  it('passes systemInstruction in the config object', async () => {
    const llm = new LLMOrchestrator({ provider: 'gemini', apiKey: 'test' })
    await llm.call({}, 'commit')
    const call = geminiMocks.generateContent.mock.calls[0][0]
    expect(call.config).toHaveProperty('systemInstruction')
    expect(typeof call.config.systemInstruction).toBe('string')
  })
})

describe('Model forwarding — Ollama', () => {
  it('sends the configured model and ollamaUrl to the POST body', async () => {
    const llm = new LLMOrchestrator({
      provider: 'ollama',
      ollamaUrl: 'http://localhost:11434',
      model: 'llama3.2',
    })
    await llm.call({}, 'commit')
    expect(axiosMocks.post).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({ model: 'llama3.2', stream: false }),
      expect.anything()
    )
  })

  it('sends a different ollamaUrl when configured differently', async () => {
    const llm = new LLMOrchestrator({
      provider: 'ollama',
      ollamaUrl: 'http://192.168.1.50:11434',
      model: 'mistral',
    })
    await llm.call({}, 'commit')
    expect(axiosMocks.post).toHaveBeenCalledWith(
      'http://192.168.1.50:11434/api/generate',
      expect.objectContaining({ model: 'mistral' }),
      expect.anything()
    )
  })

  it('includes system and prompt fields in the body', async () => {
    const llm = new LLMOrchestrator({
      provider: 'ollama',
      ollamaUrl: 'http://localhost:11434',
      model: 'llama3',
    })
    await llm.call({ diff: '+ change' }, 'commit')
    const body = axiosMocks.post.mock.calls[0][1]
    expect(typeof body.system).toBe('string')
    expect(typeof body.prompt).toBe('string')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// call() error handling
// ═══════════════════════════════════════════════════════════════════════════

describe('call() — error handling', () => {
  it('throws when OpenAI returns null content', async () => {
    openaiMocks.chatCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
    const llm = new LLMOrchestrator({ provider: 'openai', apiKey: 'test' })
    await expect(llm.call({}, 'commit')).rejects.toThrow('LLM returned empty response')
  })

  it('throws when Ollama connection is refused', async () => {
    const connErr = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    axiosMocks.post.mockRejectedValue(connErr)
    const llm = new LLMOrchestrator({ provider: 'ollama', ollamaUrl: 'http://localhost:11434', model: 'llama3' })
    await expect(llm.call({}, 'commit')).rejects.toThrow('Ollama server not running')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// generateWithApproval flows
// ═══════════════════════════════════════════════════════════════════════════

describe('generateWithApproval — skipApproval: true', () => {
  it('calls call() once and returns without showing select prompt', async () => {
    const llm = new LLMOrchestrator({ provider: 'openai', apiKey: 'test', skipApproval: true })
    const callSpy = vi.spyOn(llm, 'call').mockResolvedValue('generated message')
    const result = await llm.generateWithApproval('commit', { diff: '' })
    expect(callSpy).toHaveBeenCalledTimes(1)
    expect(result).toBe('generated message')
    expect(select).not.toHaveBeenCalled()
  })
})

describe('generateWithApproval — approve', () => {
  it('returns the approved message', async () => {
    vi.mocked(select).mockResolvedValue('approve' as 'approve' | 'retry' | 'retry_with_instructions')
    const llm = new LLMOrchestrator({ provider: 'openai', apiKey: 'test', skipApproval: false })
    vi.spyOn(llm, 'call').mockResolvedValue('approved message')
    const result = await llm.generateWithApproval('commit', { diff: '' })
    expect(result).toBe('approved message')
  })
})

describe('generateWithApproval — retry then approve', () => {
  it('calls call() twice when first action is retry', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('retry' as 'approve' | 'retry' | 'retry_with_instructions')
      .mockResolvedValueOnce('approve' as 'approve' | 'retry' | 'retry_with_instructions')
    const llm = new LLMOrchestrator({ provider: 'openai', apiKey: 'test', skipApproval: false })
    const callSpy = vi.spyOn(llm, 'call').mockResolvedValue('retry response')
    await llm.generateWithApproval('commit', { diff: '' })
    expect(callSpy).toHaveBeenCalledTimes(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// generateCommitMessageDirect (hook mode)
// ═══════════════════════════════════════════════════════════════════════════

describe('generateCommitMessageDirect', () => {
  it('calls call() directly and returns string without starting a spinner', async () => {
    const llm = new LLMOrchestrator({ provider: 'openai', apiKey: 'test' })
    const callSpy = vi.spyOn(llm, 'call').mockResolvedValue('direct message')
    const result = await llm.generateCommitMessageDirect({ diff: 'test' })
    expect(callSpy).toHaveBeenCalledWith({ diff: 'test' }, 'commit', null)
    expect(result).toBe('direct message')
    expect(streamerMocks.startThinking).not.toHaveBeenCalled()
  })
})
