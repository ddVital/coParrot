import type { GitChange } from '../../src/services/git.js'

export const modifiedFile: GitChange = {
  status: 'modified',
  statusCode: ' M',
  value: 'src/index.ts',
  checked: false,
  additions: 10,
  deletions: 3,
}

export const stagedFile: GitChange = {
  status: 'staged-added',
  statusCode: 'A ',
  value: 'src/new-feature.ts',
  checked: true,
  additions: 25,
  deletions: 0,
}

export const untrackedFile: GitChange = {
  status: 'untracked',
  statusCode: '??',
  value: 'src/draft.ts',
  checked: false,
  additions: 0,
  deletions: 0,
}

export const deletedFile: GitChange = {
  status: 'staged-deleted',
  statusCode: 'D ',
  value: 'src/old-module.ts',
  checked: true,
  additions: 0,
  deletions: 50,
}

export const renamedFile: GitChange = {
  status: 'staged-renamed',
  statusCode: 'R ',
  value: 'src/renamed.ts',
  checked: true,
  additions: 2,
  deletions: 2,
}

export const conflictFile: GitChange = {
  status: 'conflict',
  statusCode: 'UU',
  value: 'src/conflict.ts',
  checked: false,
  additions: 0,
  deletions: 0,
}

export const sampleChanges: GitChange[] = [
  modifiedFile,
  stagedFile,
  untrackedFile,
]

export const allChanges: GitChange[] = [
  modifiedFile,
  stagedFile,
  untrackedFile,
  deletedFile,
  renamedFile,
]

export const mixedChanges: GitChange[] = [
  { ...modifiedFile, value: 'src/components/Button.tsx' },
  { ...stagedFile, value: 'src/components/Modal.tsx' },
  { ...untrackedFile, value: 'tests/button.test.ts' },
  { ...modifiedFile, value: 'src/utils/helpers.ts' },
  { ...stagedFile, value: 'package.json' },
]
