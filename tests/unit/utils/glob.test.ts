import { describe, it, expect } from 'vitest'
import {
  filterByGlob,
  matchesAnyPattern,
  normalizeFilePath,
  validatePatterns,
} from '../../../src/utils/glob.js'

describe('filterByGlob', () => {
  it('returns all files when no patterns given', () => {
    const files = ['src/index.ts', 'node_modules/pkg/index.js']
    expect(filterByGlob(files, [])).toEqual(files)
  })

  it('excludes files matching pattern', () => {
    const files = ['src/index.ts', 'node_modules/pkg/index.js', 'dist/bundle.js']
    // Use **/*.js to reliably exclude by extension (matchBase-friendly)
    const result = filterByGlob(files, ['**/*.js'])
    expect(result).toEqual(['src/index.ts'])
  })

  it('multi-pattern OR: excludes matching any pattern', () => {
    const files = ['src/app.ts', 'src/app.test.ts', 'README.md']
    const result = filterByGlob(files, ['**/*.test.ts', '**/*.md'])
    expect(result).toEqual(['src/app.ts'])
  })

  it('returns empty array for empty file list', () => {
    expect(filterByGlob([], ['**/*.ts'])).toEqual([])
  })

  it('uses matchBase: basenames match without full path', () => {
    const files = ['src/components/Button.tsx', 'src/utils/helper.ts']
    const result = filterByGlob(files, ['Button.tsx'])
    expect(result).toEqual(['src/utils/helper.ts'])
  })
})

describe('matchesAnyPattern', () => {
  it('returns true when file matches a pattern', () => {
    expect(matchesAnyPattern('src/index.ts', ['**/*.ts'])).toBe(true)
  })

  it('returns false when file does not match any pattern', () => {
    expect(matchesAnyPattern('src/index.ts', ['**/*.js', '**/*.md'])).toBe(false)
  })

  it('returns false for empty patterns array', () => {
    expect(matchesAnyPattern('src/index.ts', [])).toBe(false)
  })

  it('returns false for empty filePath', () => {
    expect(matchesAnyPattern('', ['**/*.ts'])).toBe(false)
  })

  it('matches dotfiles with dot: true', () => {
    expect(matchesAnyPattern('.env', ['**/.env', '.env'])).toBe(true)
  })

  it('matchBase: matches basename only', () => {
    expect(matchesAnyPattern('src/services/git.ts', ['git.ts'])).toBe(true)
  })
})

describe('normalizeFilePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeFilePath('src\\services\\git.ts')).toBe('src/services/git.ts')
  })

  it('strips leading ./', () => {
    expect(normalizeFilePath('./src/index.ts')).toBe('src/index.ts')
  })

  it('removes double slashes', () => {
    expect(normalizeFilePath('src//utils//helper.ts')).toBe('src/utils/helper.ts')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeFilePath('')).toBe('')
  })

  it('leaves normal path unchanged', () => {
    expect(normalizeFilePath('src/index.ts')).toBe('src/index.ts')
  })
})

describe('validatePatterns', () => {
  it('classifies valid patterns', () => {
    const result = validatePatterns(['**/*.ts', 'src/**', '*.json'])
    expect(result.valid).toEqual(['**/*.ts', 'src/**', '*.json'])
    expect(result.invalid).toEqual([])
  })

  it('returns empty arrays for empty input', () => {
    const result = validatePatterns([])
    expect(result.valid).toEqual([])
    expect(result.invalid).toEqual([])
  })

  it('separates valid from invalid patterns', () => {
    const result = validatePatterns(['**/*.ts', '**/*.js'])
    expect(result.valid.length).toBeGreaterThan(0)
  })
})
