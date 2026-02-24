import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRepo, createMockProvider } from '../../helpers/mock-factory.js'

vi.mock('../../../src/services/i18n.js', () => ({
  default: {
    t: vi.fn().mockReturnValue(''),
    initialize: vi.fn(),
    getLanguage: vi.fn().mockReturnValue('en'),
  },
}))

vi.mock('../../../src/lib/streamer.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    startThinking: vi.fn(),
    stopThinking: vi.fn(),
    showWarning: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
  })),
}))

const ghMocks = vi.hoisted(() => ({
  getRepoInfo: vi.fn().mockReturnValue('{"name":"test-repo"}'),
  createPr: vi.fn().mockReturnValue('https://github.com/test/test-repo/pull/1'),
}))

vi.mock('../../../src/services/gh.js', () => ({
  default: vi.fn().mockImplementation(() => ghMocks),
}))

vi.mock('../../../src/commands/setup.js', () => ({
  detectPRTemplate: vi.fn().mockResolvedValue({ path: null }),
  setup: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../../src/services/context.js', () => ({
  loadContext: vi.fn().mockReturnValue(null),
  saveContext: vi.fn(),
  clearContext: vi.fn(),
}))

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('## PR Template'),
}))

vi.mock('fs', () => ({
  default: fsMocks,
  ...fsMocks,
}))

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn().mockResolvedValue('approve'),
  input: vi.fn().mockResolvedValue(''),
}))

import { handlePrCommand } from '../../../src/commands/pr.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  ghMocks.getRepoInfo.mockReturnValue('{"name":"test-repo"}')
  ghMocks.createPr.mockReturnValue('https://github.com/test/test-repo/pull/1')
})

describe('handlePrCommand - happy path', () => {
  it('calls provider.call for title and body, then creates PR via gh', async () => {
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue([]),
      getCurrentBranch: vi.fn().mockReturnValue('feat/new-feature'),
      baseBranch: vi.fn().mockReturnValue('main'),
      log: vi.fn().mockReturnValue('abc1234 feat: add feature\ndef5678 fix: bug'),
      diff: vi.fn().mockReturnValue('+ added code'),
    })
    const provider = createMockProvider({
      skipApproval: true,
      call: vi.fn().mockResolvedValue('PR title or body'),
    })
    provider.options.skipApproval = true

    await handlePrCommand([], repo, provider)

    expect(provider.call).toHaveBeenCalledWith(
      expect.any(Object),
      'pr-title',
      null
    )
    expect(provider.call).toHaveBeenCalledWith(
      expect.any(Object),
      'pr',
      null
    )
    expect(ghMocks.createPr).toHaveBeenCalled()
  })
})

describe('handlePrCommand - no commits', () => {
  it('shows warning and exits early when no commits between branches', async () => {
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue([]),
      getCurrentBranch: vi.fn().mockReturnValue('feat/empty-branch'),
      baseBranch: vi.fn().mockReturnValue('main'),
      log: vi.fn().mockReturnValue(''), // no commits
      diff: vi.fn().mockReturnValue(''),
    })
    const provider = createMockProvider()

    await handlePrCommand([], repo, provider)

    expect(provider.call).not.toHaveBeenCalled()
    expect(ghMocks.createPr).not.toHaveBeenCalled()
  })
})

describe('handlePrCommand - uncommitted changes', () => {
  it('shows warning and aborts when repo has uncommitted changes', async () => {
    const { modifiedFile } = await import('../../fixtures/changes.js')
    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue([modifiedFile]),
    })
    const provider = createMockProvider()

    await handlePrCommand([], repo, provider)

    expect(provider.call).not.toHaveBeenCalled()
    expect(ghMocks.createPr).not.toHaveBeenCalled()
  })
})

describe('handlePrCommand - PR template', () => {
  it('reads PR template file when config path is set', async () => {
    const { detectPRTemplate } = await import('../../../src/commands/setup.js')
    vi.mocked(detectPRTemplate).mockResolvedValue({
      path: '/project/.github/PULL_REQUEST_TEMPLATE.md',
    } as { path: string })
    fsMocks.readFileSync.mockReturnValue('## Summary\n<!-- describe -->')

    const repo = createMockRepo({
      getDetailedStatus: vi.fn().mockReturnValue([]),
      getCurrentBranch: vi.fn().mockReturnValue('feat/with-template'),
      baseBranch: vi.fn().mockReturnValue('main'),
      log: vi.fn().mockReturnValue('abc1234 feat: feature with template'),
      diff: vi.fn().mockReturnValue('+ some code'),
    })
    const provider = createMockProvider({
      call: vi.fn().mockResolvedValue('PR result'),
    })
    provider.options.skipApproval = true

    await handlePrCommand([], repo, provider)

    expect(fsMocks.readFileSync).toHaveBeenCalledWith(
      '/project/.github/PULL_REQUEST_TEMPLATE.md',
      'utf-8'
    )
  })
})
