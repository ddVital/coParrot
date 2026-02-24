import { vi } from 'vitest'
import type GitRepository from '../../src/services/git.js'
import type LLMOrchestrator from '../../src/services/llms.js'
import type CLI from '../../src/lib/cli.js'

export function createMockRepo(overrides: Record<string, unknown> = {}): GitRepository {
  return {
    repoPath: '/mock/repo',
    getDetailedStatus: vi.fn().mockReturnValue([]),
    diff: vi.fn().mockReturnValue(''),
    commit: vi.fn().mockReturnValue('[main abc1234] feat: mock commit'),
    getStagedFiles: vi.fn().mockReturnValue([]),
    add: vi.fn().mockReturnValue(''),
    addAll: vi.fn().mockReturnValue(''),
    restore: vi.fn().mockReturnValue(''),
    restoreAll: vi.fn().mockReturnValue(''),
    status: vi.fn().mockReturnValue(''),
    log: vi.fn().mockReturnValue('abc1234 feat: first commit'),
    getCurrentBranch: vi.fn().mockReturnValue('feature/test-branch'),
    baseBranch: vi.fn().mockReturnValue('main'),
    getBranches: vi.fn().mockReturnValue(['main', 'feature/test-branch']),
    createBranch: vi.fn().mockReturnValue(''),
    checkout: vi.fn().mockReturnValue(''),
    push: vi.fn().mockReturnValue(''),
    pull: vi.fn().mockReturnValue(''),
    getRemoteUrl: vi.fn().mockReturnValue('https://github.com/test/repo'),
    getRemotes: vi.fn().mockReturnValue([{ name: 'origin', url: 'https://github.com/test/repo' }]),
    isClean: vi.fn().mockReturnValue(true),
    hasUncommittedChanges: vi.fn().mockReturnValue(false),
    hasUnpushedCommits: vi.fn().mockReturnValue(false),
    getCommitCount: vi.fn().mockReturnValue(5),
    getLastCommitMessage: vi.fn().mockReturnValue('feat: last commit'),
    getLastCommitHash: vi.fn().mockReturnValue('abc1234'),
    getUnstagedFiles: vi.fn().mockReturnValue([]),
    getUntrackedFiles: vi.fn().mockReturnValue([]),
    stash: vi.fn().mockReturnValue(''),
    stashPop: vi.fn().mockReturnValue(''),
    stashList: vi.fn().mockReturnValue([]),
    validateRepo: vi.fn(),
    exec: vi.fn().mockReturnValue(''),
    _parseStatus: vi.fn().mockReturnValue([]),
    _parseNumStat: vi.fn().mockReturnValue({}),
    _getChangeType: vi.fn().mockReturnValue('modified'),
    ...overrides,
  } as unknown as GitRepository
}

export function createMockProvider(overrides: Record<string, unknown> = {}): LLMOrchestrator {
  return {
    options: {
      provider: 'openai' as const,
      skipApproval: false,
      apiKey: 'test-key',
      model: 'gpt-4',
      instructions: {
        commitConvention: { type: 'conventional', verboseCommits: false },
        prMessageStyle: 'detailed',
        customInstructions: '',
        sessionContext: null,
      },
    },
    client: undefined,
    streamer: {
      startThinking: vi.fn(),
      stopThinking: vi.fn(),
      showError: vi.fn(),
      showSuccess: vi.fn(),
      showInfo: vi.fn(),
      showWarning: vi.fn(),
    } as unknown,
    call: vi.fn().mockResolvedValue('feat: mock generated message'),
    generateCommitMessage: vi.fn().mockResolvedValue('feat: mock commit message'),
    generatePrMessage: vi.fn().mockResolvedValue('## Summary\n\nMock PR description'),
    generateCommitMessageDirect: vi.fn().mockResolvedValue('feat: mock direct message'),
    generateBranchName: vi.fn().mockResolvedValue('feat/mock-branch'),
    generateWithApproval: vi.fn().mockResolvedValue('feat: mock approved message'),
    approveLLMResponse: vi.fn().mockResolvedValue({ action: 'approve' }),
    _buildPrompts: vi.fn().mockReturnValue({ system: 'system prompt', user: 'user prompt' }),
    _callOpenAI: vi.fn().mockResolvedValue('feat: openai response'),
    _callClaude: vi.fn().mockResolvedValue('feat: claude response'),
    _callGemini: vi.fn().mockResolvedValue('feat: gemini response'),
    _callOllama: vi.fn().mockResolvedValue('feat: ollama response'),
    _initializeClient: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as unknown as LLMOrchestrator
}

export function createMockCLI(overrides: Record<string, unknown> = {}): CLI {
  return {
    options: {
      appName: 'CoParrot',
      version: '1.0.0',
      prompt: '> ',
      multiline: true,
    },
    config: {},
    streamer: {
      showWarning: vi.fn(),
      showInfo: vi.fn(),
      showError: vi.fn(),
      showSuccess: vi.fn(),
      showNothing: vi.fn(),
      startThinking: vi.fn(),
      stopThinking: vi.fn(),
      showGitInfo: vi.fn(),
      clear: vi.fn(),
      showWelcome: vi.fn().mockResolvedValue(undefined),
    } as unknown,
    conversationHistory: [],
    isRunning: false,
    lastCtrlC: 0,
    start: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    handleCommand: vi.fn().mockResolvedValue(undefined),
    showHelp: vi.fn(),
    showQuickHelp: vi.fn(),
    showHistory: vi.fn(),
    handleCtrlC: vi.fn(),
    setGitRepository: vi.fn(),
    getGitRepository: vi.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as CLI
}
