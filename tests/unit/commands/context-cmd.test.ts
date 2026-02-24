import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/services/i18n.js', () => ({
  default: {
    t: vi.fn().mockReturnValue(''),
    initialize: vi.fn(),
    getLanguage: vi.fn().mockReturnValue('en'),
  },
}))

const inputMock = vi.hoisted(() => vi.fn())

vi.mock('@inquirer/prompts', () => ({
  input: inputMock,
}))

const contextServiceMocks = vi.hoisted(() => ({
  saveContext: vi.fn(),
  loadContext: vi.fn(),
  clearContext: vi.fn(),
}))

vi.mock('../../../src/services/context.js', () => contextServiceMocks)

import { contextCommand } from '../../../src/commands/context.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('contextCommand - default (set mode)', () => {
  it('prompts for title and description, then calls saveContext', async () => {
    inputMock
      .mockResolvedValueOnce('My Feature')
      .mockResolvedValueOnce('Implementing JWT authentication')

    await contextCommand([])

    expect(contextServiceMocks.saveContext).toHaveBeenCalledWith({
      title: 'My Feature',
      description: 'Implementing JWT authentication',
    })
  })

  it('trims whitespace from inputs before saving', async () => {
    inputMock
      .mockResolvedValueOnce('  My Feature  ')
      .mockResolvedValueOnce('  Desc  ')

    await contextCommand([])

    expect(contextServiceMocks.saveContext).toHaveBeenCalledWith({
      title: 'My Feature',
      description: 'Desc',
    })
  })
})

describe('contextCommand - show', () => {
  it('prints title and description when context exists', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    contextServiceMocks.loadContext.mockReturnValue({
      title: 'Auth Feature',
      description: 'JWT login',
    })

    await contextCommand(['show'])

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Auth Feature'))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('JWT login'))
  })

  it('shows no-context message when context is null', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    contextServiceMocks.loadContext.mockReturnValue(null)

    await contextCommand(['show'])

    // Should call console.log (the warning message uses chalk but still logs)
    expect(consoleSpy).toHaveBeenCalled()
  })
})

describe('contextCommand - clear', () => {
  it('calls clearContext and shows confirmation when context exists', async () => {
    contextServiceMocks.clearContext.mockReturnValue(true)

    await contextCommand(['clear'])

    expect(contextServiceMocks.clearContext).toHaveBeenCalled()
  })

  it('shows no-context message when context does not exist', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    contextServiceMocks.clearContext.mockReturnValue(false)

    await contextCommand(['clear'])

    expect(contextServiceMocks.clearContext).toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalled()
  })
})
