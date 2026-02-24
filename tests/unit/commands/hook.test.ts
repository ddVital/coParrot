import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockCLI } from '../../helpers/mock-factory.js'

vi.mock('../../../src/services/i18n.js', () => ({
  default: {
    t: vi.fn().mockReturnValue(''),
    initialize: vi.fn(),
    getLanguage: vi.fn().mockReturnValue('en'),
  },
}))

vi.mock('../../../src/utils/platform.js', () => ({
  isWindows: false,
}))

const execSyncMock = vi.hoisted(() => vi.fn())
vi.mock('child_process', () => ({
  execSync: execSyncMock,
}))

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

vi.mock('fs', () => ({
  default: fsMocks,
  ...fsMocks,
}))

import { hookCommand } from '../../../src/commands/hook.js'

beforeEach(() => {
  vi.clearAllMocks()
  execSyncMock.mockReturnValue('.git')
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('hookCommand - install', () => {
  it('writes hook script to .git/hooks/prepare-commit-msg', async () => {
    fsMocks.existsSync.mockReturnValue(true) // hooks dir exists
    const cli = createMockCLI()

    await hookCommand(['install'], cli)

    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('prepare-commit-msg'),
      expect.stringContaining('CoParrot'),
      expect.objectContaining({ mode: 0o755 })
    )
  })

  it('creates hooks directory if it does not exist', async () => {
    fsMocks.existsSync.mockReturnValue(false) // hooks dir absent
    fsMocks.mkdirSync.mockImplementation(() => {})
    const cli = createMockCLI()

    await hookCommand(['install'], cli)

    expect(fsMocks.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('hooks'),
      expect.objectContaining({ recursive: true })
    )
    expect(fsMocks.writeFileSync).toHaveBeenCalled()
  })

  it('shows error when not in a git repo', async () => {
    execSyncMock.mockImplementationOnce(() => {
      throw new Error('not a git repo')
    })
    const cli = createMockCLI()

    await hookCommand(['install'], cli)

    expect(cli.streamer.showError).toHaveBeenCalled()
    expect(fsMocks.writeFileSync).not.toHaveBeenCalled()
  })
})

describe('hookCommand - uninstall', () => {
  it('calls unlinkSync on hook file when it exists', async () => {
    fsMocks.existsSync.mockReturnValue(true)
    const cli = createMockCLI()

    await hookCommand(['uninstall'], cli)

    expect(fsMocks.unlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('prepare-commit-msg')
    )
  })

  it('shows warning without throwing when hook does not exist', async () => {
    fsMocks.existsSync.mockReturnValue(false)
    const cli = createMockCLI()

    await expect(hookCommand(['uninstall'], cli)).resolves.not.toThrow()
    expect(fsMocks.unlinkSync).not.toHaveBeenCalled()
    expect(cli.streamer.showWarning).toHaveBeenCalled()
  })
})

describe('hookCommand - unknown subcommand', () => {
  it('shows error for unknown subcommand', async () => {
    const cli = createMockCLI()
    await hookCommand(['unknown-cmd'], cli)
    expect(cli.streamer.showError).toHaveBeenCalled()
  })
})
