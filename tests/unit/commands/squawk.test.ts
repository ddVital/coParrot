import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRepo, createMockProvider } from '../../helpers/mock-factory.js'
import { sampleChanges, mixedChanges } from '../../fixtures/changes.js'

vi.mock('../../../src/services/i18n.js', () => ({
  default: {
    t: vi.fn().mockReturnValue(''),
    initialize: vi.fn(),
    getLanguage: vi.fn().mockReturnValue('en'),
  },
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn().mockResolvedValue(false),
  input: vi.fn().mockResolvedValue(''),
}))

import {
  applyIgnorePatterns,
  applyGroupPatterns,
  calculateCommitTimestamps,
  calculateAvailableWorkingTime,
  skipToNextWorkingTime,
  squawk,
  isFatalProviderError,
} from '../../../src/commands/squawk.js'

type GitChange = typeof sampleChanges[0]

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Pure function tests ───────────────────────────────────────────────────

describe('applyIgnorePatterns', () => {
  it('returns all files when no patterns given', () => {
    const result = applyIgnorePatterns(sampleChanges)
    expect(result).toHaveLength(sampleChanges.length)
  })

  it('removes files matching ignore patterns', () => {
    const changes: GitChange[] = [
      { ...sampleChanges[0], value: 'src/index.ts' },
      { ...sampleChanges[1], value: 'src/utils/helper.js' },
    ]
    // Use **/*.js to reliably match by extension
    const result = applyIgnorePatterns(changes, ['**/*.js'])
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('src/index.ts')
  })

  it('returns all files when patterns is empty array', () => {
    const result = applyIgnorePatterns(sampleChanges, [])
    expect(result).toHaveLength(sampleChanges.length)
  })
})

describe('applyGroupPatterns', () => {
  it('returns no groups and all files ungrouped when no patterns', () => {
    const { groups, ungroupedChanges } = applyGroupPatterns(mixedChanges)
    expect(groups).toHaveLength(0)
    expect(ungroupedChanges).toHaveLength(mixedChanges.length)
  })

  it('groups files by pattern', () => {
    const { groups, ungroupedChanges } = applyGroupPatterns(mixedChanges, ['**/*.tsx'])
    expect(groups).toHaveLength(1)
    expect(groups[0].pattern).toBe('**/*.tsx')
    expect(groups[0].files.length).toBeGreaterThan(0)
  })

  it('leaves non-matching files ungrouped', () => {
    const { groups, ungroupedChanges } = applyGroupPatterns(mixedChanges, ['**/*.tsx'])
    const groupedValues = groups.flatMap(g => g.files.map(f => f.value))
    const ungroupedValues = ungroupedChanges.map(f => f.value)
    // No overlap
    expect(groupedValues.some(v => ungroupedValues.includes(v))).toBe(false)
  })
})

describe('calculateCommitTimestamps', () => {
  it('returns null when no date range specified', () => {
    const result = calculateCommitTimestamps(sampleChanges, [], {})
    expect(result).toBeNull()
  })

  it('returns null when only from is specified', () => {
    const result = calculateCommitTimestamps(sampleChanges, [], { from: '2024-01-01' })
    expect(result).toBeNull()
  })

  it('returns array of Date objects within from/to range', () => {
    const result = calculateCommitTimestamps(sampleChanges, [], {
      from: '2024-01-01',
      to: '2024-01-07',
    })
    expect(result).not.toBeNull()
    expect(result!.length).toBe(sampleChanges.length)
    const start = new Date('2024-01-01T09:00:00')
    const end = new Date('2024-01-07T18:00:00')
    for (const ts of result!) {
      expect(ts).toBeInstanceOf(Date)
      expect(ts.getTime()).toBeGreaterThanOrEqual(start.getTime())
      expect(ts.getTime()).toBeLessThanOrEqual(end.getTime())
    }
  })

  it('correct count equals groups + ungrouped', () => {
    const groups = [{ pattern: '**/*.ts', files: [sampleChanges[0]] }]
    const ungrouped = [sampleChanges[1], sampleChanges[2]]
    const result = calculateCommitTimestamps(ungrouped, groups, {
      from: '2024-01-01',
      to: '2024-01-14',
    })
    expect(result).not.toBeNull()
    expect(result!.length).toBe(3) // 1 group + 2 ungrouped
  })

  it('returns null for invalid date format', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = calculateCommitTimestamps(sampleChanges, [], {
      from: 'not-a-date',
      to: '2024-01-07',
    })
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })

  it('returns null when start date is after end date', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = calculateCommitTimestamps(sampleChanges, [], {
      from: '2024-01-07',
      to: '2024-01-01',
    })
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })
})

describe('calculateAvailableWorkingTime', () => {
  it('counts all days by default (including weekends)', () => {
    // Monday to Friday = 5 days
    const start = new Date('2024-01-08T09:00:00') // Monday
    const end = new Date('2024-01-12T18:00:00') // Friday
    const time = calculateAvailableWorkingTime(start, end, false)
    expect(time).toBe(5 * 9 * 60 * 60 * 1000)
  })

  it('skips weekends when excludeWeekends is true', () => {
    // Monday to Sunday = 7 days, 5 weekdays
    const start = new Date('2024-01-08T09:00:00') // Monday
    const end = new Date('2024-01-14T18:00:00') // Sunday
    const time = calculateAvailableWorkingTime(start, end, true)
    expect(time).toBe(5 * 9 * 60 * 60 * 1000)
  })
})

// ─── Command integration tests ─────────────────────────────────────────────

describe('squawk command', () => {
  it('shows no-changes message when repo has no changes', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const repo = createMockRepo({ getDetailedStatus: vi.fn().mockReturnValue([]) })
    const provider = createMockProvider()

    await squawk(repo, provider, [])

    expect(repo.add).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('calls repo.add + generateCommitMessage + repo.commit per file', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue(sampleChanges.slice(0, 2)),
      diff: vi.fn().mockReturnValue('+ some changes'),
      getStagedFiles: vi.fn().mockReturnValue(['src/index.ts']),
    })
    const provider = createMockProvider({
      generateCommitMessage: vi.fn().mockResolvedValue('feat: commit message'),
    })

    await squawk(repo, provider, [])

    expect(repo.add).toHaveBeenCalledTimes(2)
    expect(provider.generateCommitMessage).toHaveBeenCalledTimes(2)
    expect(repo.commit).toHaveBeenCalledTimes(2)
  })

  it('--ignore reduces processed files', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const changes: GitChange[] = [
      { ...sampleChanges[0], value: 'src/index.ts' },
      { ...sampleChanges[1], value: 'src/generated/output.js' },
    ]
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue(changes),
      diff: vi.fn().mockReturnValue('+ changes'),
      getStagedFiles: vi.fn().mockReturnValue([]),
    })
    const provider = createMockProvider({
      generateCommitMessage: vi.fn().mockResolvedValue('feat: msg'),
    })

    // Use **/*.js to reliably filter out the .js file
    await squawk(repo, provider, ['--ignore', '**/*.js'])

    // Only 1 file should be processed (the .ts file)
    expect(repo.add).toHaveBeenCalledTimes(1)
  })

  it('--group commits grouped files in a single commit', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const changes: GitChange[] = [
      { ...sampleChanges[0], value: 'src/components/Button.tsx' },
      { ...sampleChanges[1], value: 'src/components/Modal.tsx' },
      { ...sampleChanges[2], value: 'src/utils/helpers.ts' },
    ]
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue(changes),
      diff: vi.fn().mockReturnValue('+ changes'),
      getStagedFiles: vi.fn().mockReturnValue([]),
    })
    const provider = createMockProvider({
      generateCommitMessage: vi.fn().mockResolvedValue('feat: group commit'),
    })

    // Use **/*.tsx to group the two .tsx files together
    await squawk(repo, provider, ['--group', '**/*.tsx'])

    // 1 grouped commit (2 tsx files) + 1 individual file (.ts) = 2 total commits
    expect(repo.commit).toHaveBeenCalledTimes(2)
  })

  it('skips file when generateCommitMessage returns null', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue([sampleChanges[0]]),
      diff: vi.fn().mockReturnValue('+ changes'),
      getStagedFiles: vi.fn().mockReturnValue([]),
    })
    const provider = createMockProvider({
      generateCommitMessage: vi.fn().mockResolvedValue(null),
    })

    await squawk(repo, provider, [])

    expect(repo.commit).not.toHaveBeenCalled()
  })

  it('--from/--to causes repo.commit to be called with a Date', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue([sampleChanges[0]]),
      diff: vi.fn().mockReturnValue('+ changes'),
      getStagedFiles: vi.fn().mockReturnValue([]),
    })
    const provider = createMockProvider({
      generateCommitMessage: vi.fn().mockResolvedValue('feat: timestamped'),
    })

    await squawk(repo, provider, ['--from', '2024-01-08', '--to', '2024-01-12'])

    expect(repo.commit).toHaveBeenCalledWith(
      'feat: timestamped',
      expect.objectContaining({ date: expect.any(Date) })
    )
  })
})

// ─── Circuit breaker ───────────────────────────────────────────────────────

describe('isFatalProviderError', () => {
  it('returns true for Ollama connectivity error', () => {
    expect(isFatalProviderError(new Error('Ollama server not running. Start it with: ollama serve'))).toBe(true)
  })

  it('returns true for ECONNREFUSED', () => {
    expect(isFatalProviderError(new Error('connect ECONNREFUSED 127.0.0.1:11434'))).toBe(true)
  })

  it('returns true for ETIMEDOUT', () => {
    expect(isFatalProviderError(new Error('request failed: ETIMEDOUT'))).toBe(true)
  })

  it('returns true for ENOTFOUND (DNS failure)', () => {
    expect(isFatalProviderError(new Error('getaddrinfo ENOTFOUND api.openai.com'))).toBe(true)
  })

  it('returns true for Invalid API key', () => {
    expect(isFatalProviderError(new Error('Invalid API key provided'))).toBe(true)
  })

  it('returns true for Unauthorized', () => {
    expect(isFatalProviderError(new Error('401 Unauthorized'))).toBe(true)
  })

  it('returns false for a per-file diff error', () => {
    expect(isFatalProviderError(new Error('failed to read diff for file.ts'))).toBe(false)
  })

  it('returns false for a git staging error', () => {
    expect(isFatalProviderError(new Error('git add: pathspec did not match any files'))).toBe(false)
  })
})

describe('squawk command — circuit breaker', () => {
  it('stops processing remaining files after a fatal provider error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fatalError = Object.assign(new Error('Ollama server not running. Start it with: ollama serve'), {
      code: 'ECONNREFUSED',
    })
    const repo = createMockRepo({
      // 3 files queued — only the first should be attempted
      getDetailedStatus: vi.fn().mockReturnValue(sampleChanges.slice(0, 3)),
      diff: vi.fn().mockReturnValue('+ changes'),
      getStagedFiles: vi.fn().mockReturnValue([]),
    })
    const provider = createMockProvider({
      generateCommitMessage: vi.fn().mockRejectedValue(fatalError),
    })

    await squawk(repo, provider, [])

    // Only the first file's add() was called before the circuit tripped
    expect(repo.add).toHaveBeenCalledTimes(1)
    expect(provider.generateCommitMessage).toHaveBeenCalledTimes(1)
    expect(repo.commit).not.toHaveBeenCalled()
  })

  it('still commits successful files before the fatal error trips', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fatalError = new Error('Ollama server not running. Start it with: ollama serve')
    const provider = createMockProvider({
      generateCommitMessage: vi.fn()
        .mockResolvedValueOnce('feat: first file')   // first file succeeds
        .mockRejectedValue(fatalError),               // second file trips breaker
    })
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue(sampleChanges.slice(0, 3)),
      diff: vi.fn().mockReturnValue('+ changes'),
      getStagedFiles: vi.fn().mockReturnValue([]),
    })

    await squawk(repo, provider, [])

    expect(repo.commit).toHaveBeenCalledTimes(1)
    expect(repo.commit).toHaveBeenCalledWith('feat: first file')
    // Third file was never attempted
    expect(provider.generateCommitMessage).toHaveBeenCalledTimes(2)
  })

  it('does not trip the circuit for a non-fatal per-file error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const perFileError = new Error('git add: pathspec did not match any files')
    const provider = createMockProvider({
      generateCommitMessage: vi.fn().mockResolvedValue('feat: ok'),
    })
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue(sampleChanges.slice(0, 2)),
      diff: vi.fn().mockReturnValue('+ changes'),
      getStagedFiles: vi.fn().mockReturnValue([]),
      // First add throws a non-fatal error, second succeeds
      add: vi.fn()
        .mockRejectedValueOnce(perFileError)
        .mockResolvedValue(undefined),
    })

    await squawk(repo, provider, [])

    // Both files were attempted; second one committed
    expect(repo.add).toHaveBeenCalledTimes(2)
    expect(repo.commit).toHaveBeenCalledTimes(1)
  })
})
