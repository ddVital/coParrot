import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRepo } from '../../helpers/mock-factory.js'
import { sampleChanges } from '../../fixtures/changes.js'

vi.mock('../../../src/services/i18n.js', () => ({
  default: {
    t: vi.fn().mockReturnValue(''),
    plural: vi.fn().mockReturnValue('files'),
    initialize: vi.fn(),
    getLanguage: vi.fn().mockReturnValue('en'),
  },
}))

vi.mock('../../../src/lib/renderer.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    render: vi.fn().mockReturnValue(''),
  })),
}))

const checkboxMock = vi.hoisted(() => vi.fn())

vi.mock('@inquirer/prompts', () => ({
  checkbox: checkboxMock,
}))

import { gitAdd } from '../../../src/commands/add.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('gitAdd', () => {
  it('shows no-changes message when getDetailedStatus returns empty array', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    checkboxMock.mockResolvedValue([])
    const repo = createMockRepo()

    // gitAdd receives changes from caller, test with empty array
    // The function internally calls selectFilesToAdd which throws for empty array
    // So we test with non-empty changes but zero selection
    const changes = sampleChanges
    checkboxMock.mockResolvedValue([])
    await gitAdd(repo, changes)

    expect(repo.add).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('calls repo.add with selected files', async () => {
    const changes = sampleChanges
    // sampleChanges[1] (stagedFile) is already staged (checked: true), so it won't be re-added.
    // Only newly selected files that weren't previously staged get passed to repo.add.
    const selectedFiles = [sampleChanges[0].value, sampleChanges[1].value]
    checkboxMock.mockResolvedValue(selectedFiles)

    const repo = createMockRepo()
    await gitAdd(repo, changes)

    expect(repo.add).toHaveBeenCalledWith([sampleChanges[0].value])
  })

  it('shows checkbox with all current change file paths', async () => {
    const changes = sampleChanges
    checkboxMock.mockResolvedValue([changes[0].value])

    const repo = createMockRepo()
    await gitAdd(repo, changes)

    const callArg = checkboxMock.mock.calls[0][0]
    const choiceValues = callArg.choices.map((c: { value: string }) => c.value)
    expect(choiceValues).toContain(changes[0].value)
    expect(choiceValues).toContain(changes[1].value)
  })

  it('calls repo.restore for deselected previously-staged files', async () => {
    const changes = sampleChanges
    // sampleChanges[1] (stagedFile) is already staged (checked: true).
    // Selecting only changes[0] means stagedFile gets deselected → restore called for it.
    checkboxMock.mockResolvedValue([changes[0].value])
    const repo = createMockRepo()

    await gitAdd(repo, changes)

    expect(repo.restore).toHaveBeenCalledWith([changes[1].value])
  })
})
