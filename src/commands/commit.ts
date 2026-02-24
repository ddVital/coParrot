import i18n from '../services/i18n.js';
import { loadContext } from '../services/context.js';
import type GitRepository from '../services/git.js';
import type LLMOrchestrator from '../services/llms.js';
import type CLIClass from '../lib/cli.js';

function applyVerboseOverride(args: string[], provider: LLMOrchestrator): void {
  const verbose = args.includes('--verbose') || args.includes('-v');
  if (verbose && provider.options.instructions?.commitConvention) {
    provider.options.instructions.commitConvention.verboseCommits = true;
  }
}

async function hookCommit(repo: GitRepository, provider: LLMOrchestrator): Promise<void> {
  const diff = repo.diff([], { staged: true, compact: true });
  if (!diff) return;

  const context = { diff, stagedFiles: repo.getStagedFiles() };
  const commitMessage = await provider.generateCommitMessageDirect(context);
  console.log(commitMessage);
}

async function interactiveCommit(repo: GitRepository, provider: LLMOrchestrator, cli: CLIClass): Promise<void> {
  const diff = repo.diff([], { staged: true, compact: true });

  if (!diff) {
    cli.streamer.showNothing(i18n.t('git.commit.noFilesStaged'));
    return;
  }

  const sessionCtx = loadContext();
  if (!sessionCtx) {
    cli.streamer.showInfo(i18n.t('context.hint'));
  }

  const context = { diff, stagedFiles: repo.getStagedFiles() };
  const commitMessage = await provider.generateCommitMessage(context);
  if (commitMessage) {
    execCommit(repo, commitMessage);
  }
}

function execCommit(repo: GitRepository, message: string): void {
  try {
    const output = repo.commit(message);
    console.log(output);
  } catch (error) {
    const err = error as Error;
    console.error(i18n.t('output.prefixes.error'), err.message);
    throw error;
  }
}

export async function commitCommand(repo: GitRepository, provider: LLMOrchestrator, args: string[], cli: CLIClass): Promise<void> {
  applyVerboseOverride(args, provider);

  if (args.includes('--hook')) {
    await hookCommit(repo, provider);
  } else {
    await interactiveCommit(repo, provider, cli);
  }
}

