import fs from 'fs';
import chalk from 'chalk';
import { select, input } from '@inquirer/prompts';
import StreamingOutput from '../lib/streamer.js';
import type GitRepository from '../services/git.js';
import type LLMOrchestrator from '../services/llms.js';
import GithubCli from '../services/gh.js';
import { detectPRTemplate } from './setup.js';
import i18n from '../services/i18n.js';
import { loadContext } from '../services/context.js';
import type { PRContext } from '../services/prompts.js';

export async function handlePrCommand(
  args: string[],
  repo: GitRepository,
  provider: LLMOrchestrator
): Promise<void> {
  const streamer = new StreamingOutput(null);

  if (!loadContext()) {
    streamer.showInfo(i18n.t('context.hint'));
  }

  // Validate gh CLI (throws if not installed/authenticated)
  const gh = new GithubCli();

  // Check for uncommitted changes — abort if any
  const status = repo.getDetailedStatus();
  if (status.length > 0) {
    streamer.showWarning(i18n.t('pr.uncommittedChanges'));
    return;
  }

  // Determine target branch: first non-flag arg, or repo default
  const targetArg = args.find(a => !a.startsWith('-'));
  const currentBranch = repo.getCurrentBranch().trim();
  const baseBranch = targetArg || repo.baseBranch().replace(/^refs\/remotes\/origin\//, '').trim();

  // Get commits ahead of base
  const logs = repo.log({ limit: 0, aheadof: baseBranch });
  if (!logs.trim()) {
    streamer.showWarning(i18n.t('pr.noBranchDiff', { base: baseBranch }));
    return;
  }

  const commits = logs.trim().split('\n').filter(Boolean);

  // Get full diff vs base (default unified context for proper code understanding)
  const diff = repo.diff([], { revisionRange: `${baseBranch}...HEAD` });

  // Detect PR template — pass the whole file, not parsed sections
  const prTemplate = await detectPRTemplate();
  let template: string | undefined;

  if (prTemplate.path) {
    template = fs.readFileSync(prTemplate.path, 'utf-8');
  }

  // Get repo info
  let repoName = '';
  try {
    const repoInfo = JSON.parse(gh.getRepoInfo());
    repoName = repoInfo.name || '';
  } catch {
    repoName = '';
  }

  // Build PRContext
  const context: PRContext = {
    repository: { name: repoName },
    headBranch: currentBranch,
    baseBranch,
    commits,
    diff,
    template
  };

  // Generate title and body separately, combine for single approval
  const skipApproval = provider.options.skipApproval;
  let approved = false;
  let title = '';
  let body = '';
  let customInstructions: string | null = null;

  while (!approved) {
    streamer.startThinking('Generating PR title...');
    title = await provider.call(context, 'pr-title', customInstructions);
    streamer.stopThinking();

    streamer.startThinking('Generating PR body...');
    body = await provider.call(context, 'pr', customInstructions);
    body = stripCodeFences(body);
    streamer.stopThinking();

    if (skipApproval) {
      approved = true;
    } else {
      // Show combined result for approval
      console.log('\n' + chalk.grey('## ') + chalk.white(title));
      console.log('\n' + chalk.white(body) + '\n');

      const result = await select<'approve' | 'retry' | 'retry_with_instructions'>({
        message: i18n.t('llm.approvalPrompt'),
        choices: [
          { name: i18n.t('llm.approvalOptions.approve'), value: 'approve' as const },
          { name: i18n.t('llm.approvalOptions.retry'), value: 'retry' as const },
          { name: i18n.t('llm.approvalOptions.retryWithInstructions'), value: 'retry_with_instructions' as const }
        ]
      }, { clearPromptOnDone: true });

      if (result === 'approve') {
        approved = true;
      } else if (result === 'retry') {
        customInstructions = null;
      } else {
        customInstructions = await input({
          message: i18n.t('llm.customInstructionsPrompt')
        }, { clearPromptOnDone: true });
      }
    }
  }

  // Create the PR
  const prResult = gh.createPr(title.trim(), body.trim(), baseBranch);
  streamer.showSuccess(i18n.t('pr.created'));

  // Print the PR URL (gh pr create outputs the URL)
  console.log(prResult.trim());
}

/**
 * Strip wrapping code fences that LLMs sometimes add around markdown output
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n\s*```\s*$/);
  return match ? match[1] : trimmed;
}
