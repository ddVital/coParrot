import { describe, it, expect } from 'vitest'
import { parseFlag, hasFlag } from '../../../src/utils/args-parser.js'

describe('parseFlag', () => {
  it('returns values after flag until next flag', () => {
    const args = ['--ignore', 'node_modules', '*.tmp', '--group', 'src']
    expect(parseFlag(args, '--ignore')).toEqual(['node_modules', '*.tmp'])
  })

  it('returns all values when no next flag', () => {
    const args = ['--ignore', 'node_modules', 'dist']
    expect(parseFlag(args, '--ignore')).toEqual(['node_modules', 'dist'])
  })

  it('returns empty array when flag not found', () => {
    const args = ['--group', 'src']
    expect(parseFlag(args, '--ignore')).toEqual([])
  })

  it('returns empty array for empty args', () => {
    expect(parseFlag([], '--ignore')).toEqual([])
  })

  it('strips surrounding double quotes from values', () => {
    const args = ['--ignore', '"node_modules"', '"dist"']
    expect(parseFlag(args, '--ignore')).toEqual(['node_modules', 'dist'])
  })

  it('strips surrounding single quotes from values', () => {
    const args = ['--ignore', "'*.tmp'"]
    expect(parseFlag(args, '--ignore')).toEqual(['*.tmp'])
  })

  it('returns empty array when flag has no values', () => {
    const args = ['--ignore', '--group', 'src']
    expect(parseFlag(args, '--ignore')).toEqual([])
  })

  it('stops at short flag (-)', () => {
    const args = ['--from', '2024-01-01', '-v']
    expect(parseFlag(args, '--from')).toEqual(['2024-01-01'])
  })
})

describe('hasFlag', () => {
  it('returns true for single string flag present', () => {
    expect(hasFlag(['--verbose', '--hook'], '--verbose')).toBe(true)
  })

  it('returns false for absent flag', () => {
    expect(hasFlag(['--hook'], '--verbose')).toBe(false)
  })

  it('returns true if any alias in array is present', () => {
    expect(hasFlag(['-v', '--hook'], ['-v', '--verbose'])).toBe(true)
    expect(hasFlag(['--verbose', '--hook'], ['-v', '--verbose'])).toBe(true)
  })

  it('returns false if no alias in array is present', () => {
    expect(hasFlag(['--hook'], ['-v', '--verbose'])).toBe(false)
  })

  it('returns false for empty args', () => {
    expect(hasFlag([], '--verbose')).toBe(false)
  })
})

