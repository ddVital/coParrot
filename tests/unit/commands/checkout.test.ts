import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRepo, createMockProvider } from '../../helpers/mock-factory.js'

vi.mock('../../../src/services/i18n.js', () => ({
  default: {
    t: vi.fn().mockReturnValue(''),
    initialize: vi.fn(),
    getLanguage: vi.fn().mockReturnValue('en'),
  },
}))

const selectMock = vi.hoisted(() => vi.fn())

vi.mock('@inquirer/prompts', () => ({
  select: selectMock,
}))

import { gitCheckout } from '../../../src/commands/checkout.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('gitCheckout', () => {
  describe('interactive mode (no args)', () => {
    it('shows branch selector and checks out selected branch', async () => {
      const repo = createMockRepo()
      const provider = createMockProvider()
      selectMock.mockResolvedValue('develop')

      await gitCheckout(repo, provider, [])

      expect(selectMock).toHaveBeenCalled()
      expect(repo.checkout).toHaveBeenCalledWith('develop')
    })

    it('logs error when no branches are available', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const repo = createMockRepo({ getBranches: vi.fn().mockReturnValue([]) })
      const provider = createMockProvider()

      await gitCheckout(repo, provider, [])

      expect(selectMock).not.toHaveBeenCalled()
      expect(repo.checkout).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('switch mode (positional branch name)', () => {
    it('checks out the named branch when passed as positional arg', async () => {
      const repo = createMockRepo()
      const provider = createMockProvider()

      await gitCheckout(repo, provider, ['main'])

      expect(repo.checkout).toHaveBeenCalledWith('main')
      expect(selectMock).not.toHaveBeenCalled()
    })

    it('logs the output returned by repo.checkout', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const repo = createMockRepo({ checkout: vi.fn().mockReturnValue('Switched to branch main') })
      const provider = createMockProvider()

      await gitCheckout(repo, provider, ['main'])

      expect(consoleSpy).toHaveBeenCalledWith('Switched to branch main')
      consoleSpy.mockRestore()
    })
  })

  describe('create mode (-b flag)', () => {
    it('creates and checks out branch with explicit name', async () => {
      const repo = createMockRepo()
      const provider = createMockProvider()

      await gitCheckout(repo, provider, ['-b', 'feature/new-thing'])

      expect(repo.createBranch).toHaveBeenCalledWith('feature/new-thing', true)
    })

    it('generates branch name via AI when -b has no name', async () => {
      const repo = createMockRepo()
      const provider = createMockProvider()

      await gitCheckout(repo, provider, ['-b'])

      expect(provider.generateBranchName).toHaveBeenCalled()
      expect(repo.createBranch).toHaveBeenCalledWith('feat/mock-branch', true)
    })

    it('does not call createBranch when AI generation returns null', async () => {
      const repo = createMockRepo()
      const provider = createMockProvider({
        generateBranchName: vi.fn().mockResolvedValue(null),
      })

      await gitCheckout(repo, provider, ['-b'])

      expect(repo.createBranch).not.toHaveBeenCalled()
    })

    it('logs the output returned by repo.createBranch', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const repo = createMockRepo({
        createBranch: vi.fn().mockReturnValue('Switched to a new branch feature/foo'),
      })
      const provider = createMockProvider()

      await gitCheckout(repo, provider, ['-b', 'feature/foo'])

      expect(consoleSpy).toHaveBeenCalledWith('Switched to a new branch feature/foo')
      consoleSpy.mockRestore()
    })
  })

  describe('error handling', () => {
    it('logs error when repo.checkout throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const repo = createMockRepo({
        checkout: vi.fn().mockImplementation(() => { throw new Error('branch not found') }),
      })
      const provider = createMockProvider()

      await gitCheckout(repo, provider, ['nonexistent'])

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('logs error when repo.createBranch throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const repo = createMockRepo({
        createBranch: vi.fn().mockImplementation(() => { throw new Error('branch already exists') }),
      })
      const provider = createMockProvider()

      await gitCheckout(repo, provider, ['-b', 'existing-branch'])

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
