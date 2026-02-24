import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRepo, createMockProvider, createMockCLI } from '../../helpers/mock-factory.js'

vi.mock('../../../src/services/i18n.js', () => ({
  default: {
    t: vi.fn().mockReturnValue(''),
    initialize: vi.fn(),
    getLanguage: vi.fn().mockReturnValue('en'),
  },
}))

vi.mock('../../../src/services/context.js', () => ({
  loadContext: vi.fn().mockReturnValue(null),
}))

import { commitCommand } from '../../../src/commands/commit.js'
import { loadContext } from '../../../src/services/context.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('commitCommand - interactive mode', () => {
  it('shows warning and does not call generateCommitMessage when no staged diff', async () => {
    const repo = createMockRepo({ diff: vi.fn().mockReturnValue('') })
    const provider = createMockProvider()
    const cli = createMockCLI()

    await commitCommand(repo, provider, [], cli)

    expect(provider.generateCommitMessage).not.toHaveBeenCalled()
    expect(cli.streamer.showWarning).toHaveBeenCalled()
  })

  it('calls generateCommitMessage then repo.commit with returned message', async () => {
    const repo = createMockRepo({ diff: vi.fn().mockReturnValue('+ added line') })
    const provider = createMockProvider({
      generateCommitMessage: vi.fn().mockResolvedValue('feat: add new feature'),
    })
    const cli = createMockCLI()

    await commitCommand(repo, provider, [], cli)

    expect(provider.generateCommitMessage).toHaveBeenCalledOnce()
    expect(repo.commit).toHaveBeenCalledWith('feat: add new feature')
  })

  it('does not call repo.commit when generateCommitMessage returns null', async () => {
    const repo = createMockRepo({ diff: vi.fn().mockReturnValue('+ some change') })
    const provider = createMockProvider({
      generateCommitMessage: vi.fn().mockResolvedValue(null),
    })
    const cli = createMockCLI()

    await commitCommand(repo, provider, [], cli)

    expect(repo.commit).not.toHaveBeenCalled()
  })
})

describe('commitCommand - --hook flag', () => {
  it('calls generateCommitMessageDirect and prints to stdout, not repo.commit', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const repo = createMockRepo({ diff: vi.fn().mockReturnValue('+ hook diff') })
    const provider = createMockProvider({
      generateCommitMessageDirect: vi.fn().mockResolvedValue('feat: hook message'),
    })
    const cli = createMockCLI()

    await commitCommand(repo, provider, ['--hook'], cli)

    expect(provider.generateCommitMessageDirect).toHaveBeenCalledOnce()
    expect(consoleSpy).toHaveBeenCalledWith('feat: hook message')
    expect(repo.commit).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('does nothing when hook diff is empty', async () => {
    const repo = createMockRepo({ diff: vi.fn().mockReturnValue('') })
    const provider = createMockProvider()
    const cli = createMockCLI()

    await commitCommand(repo, provider, ['--hook'], cli)

    expect(provider.generateCommitMessageDirect).not.toHaveBeenCalled()
  })
})

describe('commitCommand - --verbose flag', () => {
  it('sets verboseCommits to true on provider options', async () => {
    const repo = createMockRepo({ diff: vi.fn().mockReturnValue('+ change') })
    const provider = createMockProvider()
    const cli = createMockCLI()

    await commitCommand(repo, provider, ['--verbose'], cli)

    expect(provider.options.instructions?.commitConvention?.verboseCommits).toBe(true)
  })

  it('-v alias also sets verboseCommits', async () => {
    const repo = createMockRepo({ diff: vi.fn().mockReturnValue('+ change') })
    const provider = createMockProvider()
    const cli = createMockCLI()

    await commitCommand(repo, provider, ['-v'], cli)

    expect(provider.options.instructions?.commitConvention?.verboseCommits).toBe(true)
  })
})
