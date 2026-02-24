import { describe, it, expect } from 'vitest'
import GitRepository from '../../../src/services/git.js'

// Access parsing methods directly on the prototype — no constructor, no execSync needed
const repo = Object.create(GitRepository.prototype) as InstanceType<typeof GitRepository>

describe('_getChangeType', () => {
  it('staged-modified: "M "', () => {
    expect(repo._getChangeType('M ')).toBe('staged-modified')
  })

  it('modified: " M"', () => {
    expect(repo._getChangeType(' M')).toBe('modified')
  })

  it('untracked: "??"', () => {
    expect(repo._getChangeType('??')).toBe('untracked')
  })

  it('conflict: "UU"', () => {
    expect(repo._getChangeType('UU')).toBe('conflict')
  })

  it('staged-added: "A "', () => {
    expect(repo._getChangeType('A ')).toBe('staged-added')
  })

  it('staged-renamed: "R "', () => {
    expect(repo._getChangeType('R ')).toBe('staged-renamed')
  })

  it('staged-deleted: "D "', () => {
    expect(repo._getChangeType('D ')).toBe('staged-deleted')
  })

  it('staged-and-modified: "AM"', () => {
    expect(repo._getChangeType('AM')).toBe('staged-and-modified')
  })

  it('staged-and-modified: "MM"', () => {
    expect(repo._getChangeType('MM')).toBe('staged-and-modified')
  })

  it('ignored: "!!"', () => {
    expect(repo._getChangeType('!!')).toBe('ignored')
  })

  it('unknown for unrecognized status', () => {
    expect(repo._getChangeType('XY')).toBe('unknown')
  })
})

describe('_parseNumStat', () => {
  it('returns empty object for empty input', () => {
    expect(repo._parseNumStat('')).toEqual({})
  })

  it('parses additions and deletions', () => {
    const numstat = '5\t3\tsrc/index.ts\n10\t2\tsrc/utils.ts'
    const result = repo._parseNumStat(numstat)
    expect(result['src/index.ts']).toEqual({ additions: 5, deletions: 3 })
    expect(result['src/utils.ts']).toEqual({ additions: 10, deletions: 2 })
  })

  it('handles binary files with dash (→ 0/0)', () => {
    const numstat = '-\t-\timages/logo.png'
    const result = repo._parseNumStat(numstat)
    expect(result['images/logo.png']).toEqual({ additions: 0, deletions: 0 })
  })

  it('strips quotes from filenames with spaces', () => {
    const numstat = '3\t1\t"file with spaces.ts"'
    const result = repo._parseNumStat(numstat)
    expect(result['file with spaces.ts']).toEqual({ additions: 3, deletions: 1 })
  })

  it('handles single file entry', () => {
    const numstat = '7\t0\tsrc/new-file.ts'
    const result = repo._parseNumStat(numstat)
    expect(result['src/new-file.ts']).toEqual({ additions: 7, deletions: 0 })
  })
})

describe('_parseStatus', () => {
  it('returns empty array for empty status', () => {
    expect(repo._parseStatus('', '')).toEqual([])
  })

  it('parses unstaged modified file', () => {
    const status = ' M src/index.ts'
    const result = repo._parseStatus(status, '')
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('src/index.ts')
    expect(result[0].status).toBe('modified')
    expect(result[0].statusCode).toBe(' M')
    expect(result[0].checked).toBe(false)
  })

  it('parses staged added file', () => {
    const status = 'A  src/new-feature.ts'
    const result = repo._parseStatus(status, '')
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('src/new-feature.ts')
    expect(result[0].status).toBe('staged-added')
    expect(result[0].checked).toBe(true)
  })

  it('parses untracked file', () => {
    const status = '?? src/draft.ts'
    const result = repo._parseStatus(status, '')
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('src/draft.ts')
    expect(result[0].status).toBe('untracked')
    expect(result[0].checked).toBe(false)
  })

  it('extracts new filename from renamed file', () => {
    const status = 'R  old-name.ts -> new-name.ts'
    const result = repo._parseStatus(status, '')
    expect(result[0].value).toBe('new-name.ts')
    expect(result[0].status).toBe('staged-renamed')
  })

  it('merges numstat additions/deletions', () => {
    const status = ' M src/index.ts'
    const numstat = '10\t3\tsrc/index.ts'
    const result = repo._parseStatus(status, numstat)
    expect(result[0].additions).toBe(10)
    expect(result[0].deletions).toBe(3)
  })

  it('parses multiple files', () => {
    const status = ' M src/a.ts\nA  src/b.ts\n?? src/c.ts'
    const result = repo._parseStatus(status, '')
    expect(result).toHaveLength(3)
    expect(result[0].value).toBe('src/a.ts')
    expect(result[1].value).toBe('src/b.ts')
    expect(result[2].value).toBe('src/c.ts')
  })
})
