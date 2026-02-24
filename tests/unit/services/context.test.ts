import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/utils/platform.js', () => ({
  getConfigDir: vi.fn().mockReturnValue('/mock/config'),
  isWindows: false,
}))

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

vi.mock('fs', () => ({
  default: fsMocks,
  ...fsMocks,
}))

import { loadContext, saveContext, clearContext } from '../../../src/services/context.js'
import type { SessionContext } from '../../../src/services/context.js'

const mockContext: SessionContext = {
  title: 'My Feature',
  description: 'Implementing the login flow',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadContext', () => {
  it('returns null when context file is absent', () => {
    fsMocks.existsSync.mockReturnValue(false)
    expect(loadContext()).toBeNull()
  })

  it('returns parsed object when context file exists', () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.readFileSync.mockReturnValue(JSON.stringify(mockContext))
    const ctx = loadContext()
    expect(ctx).toEqual(mockContext)
    expect(ctx?.title).toBe('My Feature')
  })

  it('returns null on JSON parse error', () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.readFileSync.mockReturnValue('not-json{{{')
    expect(loadContext()).toBeNull()
  })
})

describe('saveContext', () => {
  it('writes JSON to context file', () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.writeFileSync.mockImplementation(() => {})
    saveContext(mockContext)
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('context.json'),
      JSON.stringify(mockContext, null, 2),
      'utf-8'
    )
  })

  it('creates config dir if absent before writing', () => {
    fsMocks.existsSync.mockReturnValue(false)
    fsMocks.mkdirSync.mockImplementation(() => {})
    fsMocks.writeFileSync.mockImplementation(() => {})
    saveContext(mockContext)
    expect(fsMocks.mkdirSync).toHaveBeenCalledWith('/mock/config', { recursive: true })
  })
})

describe('clearContext', () => {
  it('calls unlinkSync and returns true when file exists', () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.unlinkSync.mockImplementation(() => {})
    const result = clearContext()
    expect(result).toBe(true)
    expect(fsMocks.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('context.json'))
  })

  it('returns false when context file does not exist', () => {
    fsMocks.existsSync.mockReturnValue(false)
    const result = clearContext()
    expect(result).toBe(false)
    expect(fsMocks.unlinkSync).not.toHaveBeenCalled()
  })
})
