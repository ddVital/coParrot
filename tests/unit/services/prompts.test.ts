import { describe, it, expect } from 'vitest'
import {
  buildCommitPrompts,
  buildBranchPrompts,
  buildPRPrompts,
  buildPRTitlePrompts,
  buildPrompts,
} from '../../../src/services/prompts.js'
import type { CommitContext, BranchContext, PRContext } from '../../../src/services/prompts.js'

const commitCtx: CommitContext = {
  diff: '+ added line\n- removed line',
  stagedFiles: ['src/index.ts', 'src/utils/helper.ts'],
}

const branchCtx: BranchContext = {
  description: 'Add user authentication',
  recentBranches: ['feat/dark-mode', 'fix/login-bug'],
}

const prCtx: PRContext = {
  repository: { name: 'my-project' },
  headBranch: 'feat/new-feature',
  baseBranch: 'main',
  commits: ['abc1234 feat: add new feature', 'def5678 test: add tests'],
  diff: '+ new code\n- old code',
}

describe('buildCommitPrompts', () => {
  it('system contains conventional commit keywords for conventional convention', () => {
    const { system } = buildCommitPrompts(commitCtx, 'conventional')
    expect(system).toContain('feat')
    expect(system).toContain('fix')
  })

  it('system contains gitmoji for gitmoji convention', () => {
    const { system } = buildCommitPrompts(commitCtx, 'gitmoji')
    expect(system).toContain('gitmoji')
  })

  it('user contains diff', () => {
    const { user } = buildCommitPrompts(commitCtx, 'conventional')
    expect(user).toContain('+ added line')
    expect(user).toContain('- removed line')
  })

  it('user contains staged file list', () => {
    const { user } = buildCommitPrompts(commitCtx)
    expect(user).toContain('src/index.ts')
    expect(user).toContain('src/utils/helper.ts')
  })

  it('verbose flag adds body hint to system prompt', () => {
    const { system } = buildCommitPrompts(commitCtx, 'conventional', '', '', true)
    expect(system).toContain('body')
  })

  it('custom instructions are injected into system prompt', () => {
    const { system } = buildCommitPrompts(commitCtx, 'conventional', '', 'use imperative tense only')
    expect(system).toContain('use imperative tense only')
  })

  it('session context is injected into user prompt', () => {
    const ctx = { title: 'Auth feature', description: 'Implementing JWT auth' }
    const { user } = buildCommitPrompts(commitCtx, 'conventional', '', '', false, ctx)
    expect(user).toContain('Auth feature')
    expect(user).toContain('Implementing JWT auth')
  })

  it('unknown convention falls back to conventional format', () => {
    const { system } = buildCommitPrompts(commitCtx, 'unknown-convention' as string)
    expect(system).toContain('feat')
    expect(system).toContain('fix')
  })
})

describe('buildBranchPrompts', () => {
  it('user contains description', () => {
    const { user } = buildBranchPrompts(branchCtx)
    expect(user).toContain('Add user authentication')
  })

  it('system includes recent branches when provided', () => {
    const { system } = buildBranchPrompts(branchCtx)
    expect(system).toContain('feat/dark-mode')
    expect(system).toContain('fix/login-bug')
  })

  it('system contains branch naming convention rules', () => {
    const { system } = buildBranchPrompts(branchCtx, 'gitflow')
    expect(system).toContain('feat')
    expect(system).toContain('fix')
  })
})

describe('buildPRPrompts', () => {
  it('uses template-filling prompt when template given', () => {
    const ctxWithTemplate: PRContext = { ...prCtx, template: '## Summary\n<!-- describe -->' }
    const { system } = buildPRPrompts(ctxWithTemplate)
    expect(system).toContain('template')
  })

  it('uses generic prompt when no template', () => {
    const { system } = buildPRPrompts(prCtx)
    expect(system).toContain('PR')
  })

  it('user contains commits', () => {
    const { user } = buildPRPrompts(prCtx)
    expect(user).toContain('feat: add new feature')
  })

  it('user contains diff', () => {
    const { user } = buildPRPrompts(prCtx)
    expect(user).toContain('+ new code')
  })
})

describe('buildPRTitlePrompts', () => {
  it('system instructs to output ONLY the PR title', () => {
    const { system } = buildPRTitlePrompts(prCtx)
    expect(system).toContain('ONLY the PR title')
  })

  it('user contains branch names', () => {
    const { user } = buildPRTitlePrompts(prCtx)
    expect(user).toContain('feat/new-feature')
    expect(user).toContain('main')
  })
})

describe('buildPrompts dispatcher', () => {
  it('routes "commit" type to commit prompt builder', () => {
    const result = buildPrompts('commit', commitCtx, { convention: 'conventional' })
    expect(result.system).toContain('feat')
    expect(result.user).toContain('+ added line')
  })

  it('routes "branch" type to branch prompt builder', () => {
    const result = buildPrompts('branch', branchCtx)
    expect(result.user).toContain('Add user authentication')
  })

  it('routes "pr" type to PR prompt builder', () => {
    const result = buildPrompts('pr', prCtx)
    expect(result.user).toContain('feat: add new feature')
  })

  it('routes "pr-title" type to PR title prompt builder', () => {
    const result = buildPrompts('pr-title', prCtx)
    expect(result.system).toContain('ONLY the PR title')
  })

  it('returns generic prompt for unknown type', () => {
    const result = buildPrompts('unknown', 'some context')
    expect(result.system).toContain('Generate the requested output')
    expect(result.user).toContain('some context')
  })
})
