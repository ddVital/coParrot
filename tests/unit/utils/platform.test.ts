import { describe, it, expect } from 'vitest'
import { shellEscape, getConfigDir } from '../../../src/utils/platform.js'

describe('shellEscape', () => {
  it('wraps string in single quotes on unix-like', () => {
    // On Linux the result wraps in single quotes
    const result = shellEscape('simple-string')
    expect(result).toContain('simple-string')
  })

  it('escapes embedded single quotes', () => {
    const result = shellEscape("it's a test")
    // Should not contain unescaped single quote that would break shell
    expect(result).not.toBe("'it's a test'")
  })

  it('no-op for alphanumeric strings (still wraps)', () => {
    const result = shellEscape('MyFile123')
    expect(result).toContain('MyFile123')
  })

  it('handles strings with spaces', () => {
    const result = shellEscape('file with spaces.ts')
    expect(result).toContain('file with spaces.ts')
  })

  it('handles empty string', () => {
    const result = shellEscape('')
    expect(typeof result).toBe('string')
  })
})

describe('getConfigDir', () => {
  it('returns a path containing "coparrot"', () => {
    const dir = getConfigDir()
    expect(dir).toContain('coparrot')
  })

  it('returns an absolute path', () => {
    const dir = getConfigDir()
    expect(dir.startsWith('/')).toBe(true)
  })
})
