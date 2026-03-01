import i18n from '../services/i18n.js';
import { select, checkbox } from '@inquirer/prompts';
import { parseFlag } from '../utils/args-parser.js';
import type GitRepository from '../services/git.js';
import type LLMOrchestrator from '../services/llms.js';

interface ParsedCheckoutArgs {
  branchName: string | null;
  shouldCreate: boolean;
  shouldDelete: boolean;
  forceDelete: boolean;
}

interface ValidateCheckoutArgsInput {
  branchName: string | null;
  hasCreateFlag: boolean;
  hasDeleteFlag: boolean;
}

/**
 * Handles git checkout operations
 * Supports:
 * - checkout: Interactive branch selection
 * - checkout <branch>: Switch to existing branch
 * - checkout -b <name>: Create and checkout new branch
 * - checkout -b: Generate branch name from session context via AI
 */
export async function gitCheckout(
  repo: GitRepository,
  provider: LLMOrchestrator,
  args: string[]
): Promise<void> {
  // Parse and validate arguments
  const parsedArgs = parseCheckoutArgs(args);
  if (!parsedArgs) return; // Validation failed, error already logged

  const { branchName, shouldCreate, shouldDelete, forceDelete } = parsedArgs;

  try {
    if (shouldDelete) {
      // Delete mode — interactive if no branch name given
      await deleteCheckout(repo, branchName, forceDelete);
    } else if (!shouldCreate && !branchName) {
      // Interactive mode: select from existing branches
      await interactiveCheckout(repo);
    } else if (shouldCreate) {
      // Create and checkout — name may come from AI if not provided
      await createCheckout(repo, provider, branchName);
    } else {
      // Switch to existing branch
      const output = repo.checkout(branchName!);
      console.log(output || i18n.t('git.checkout.switched', { branch: branchName }));
    }
  } catch (error) {
    const err = error as Error;
    console.error(i18n.t('output.prefixes.error'), err.message);
  }
}

async function interactiveCheckout(repo: GitRepository): Promise<void> {
  const branches = repo.getBranches();
  if (branches.length === 0) {
    console.error(i18n.t('output.prefixes.error'), i18n.t('git.checkout.noBranches'));
    return;
  }
  const selected = await select({
    message: i18n.t('git.checkout.selectBranch'),
    choices: branches.map(b => ({ value: b, name: b }))
  });
  const output = repo.checkout(selected);
  console.log(output || i18n.t('git.checkout.switched', { branch: selected }));
}

async function createCheckout(
  repo: GitRepository,
  provider: LLMOrchestrator,
  branchName: string | null
): Promise<void> {
  const recentBranches = repo.getBranches({ count: 10 });
  const finalBranchName = branchName || await provider.generateBranchName({
    description: null,
    recentBranches
  });
  if (!finalBranchName) return; // user cancelled approval

  const output = repo.createBranch(finalBranchName, true);
  console.log(output || i18n.t('git.checkout.created', { branch: finalBranchName }));
}

async function deleteCheckout(
  repo: GitRepository,
  branchName: string | null,
  force: boolean
): Promise<void> {
  const currentBranch = repo.getCurrentBranch().trim();

  if (branchName) {
    const output = repo.deleteBranch(branchName, force);
    console.log(output);
  } else {
    // Interactive: list all branches except the current one
    const branches = repo.getBranches().filter(b => b !== currentBranch);
    if (branches.length === 0) {
      console.error(i18n.t('output.prefixes.error'), i18n.t('git.checkout.noBranches'));
      return;
    }
    const selected = await checkbox({
      message: i18n.t('git.checkout.selectBranchToDelete'),
      choices: branches.map(b => ({ value: b, name: b }))
    });
    if (selected.length === 0) return;
    for (const branch of selected) {
      const output = repo.deleteBranch(branch, force);
      console.log(output);
    }
  }
}

/**
 * Parses and validates checkout command arguments
 * Returns null if validation fails
 */
function parseCheckoutArgs(args: string[]): ParsedCheckoutArgs | null {
  const hasCreateFlag = args.includes('-b');
  const forceDelete = args.includes('-D');
  const hasDeleteFlag = forceDelete || args.includes('-d');

  // Determine the active flag to find the associated branch name
  const activeFlag = hasCreateFlag ? '-b' : forceDelete ? '-D' : hasDeleteFlag ? '-d' : null;
  const branchName = activeFlag
    ? parseFlag(args, activeFlag)[0] || null
    : args.find(a => !a.startsWith('-')) || null;

  // Validate argument combinations
  const validationError = validateCheckoutArgs({ branchName, hasCreateFlag, hasDeleteFlag });
  if (validationError !== null) {
    console.error(i18n.t('output.prefixes.error'), validationError);
    return null;
  }

  return {
    branchName,
    shouldCreate: hasCreateFlag,
    shouldDelete: hasDeleteFlag,
    forceDelete,
  };
}

/**
 * Validates checkout arguments and returns error message if invalid
 * Returns null if valid
 */
function validateCheckoutArgs({
  hasCreateFlag,
  hasDeleteFlag
}: ValidateCheckoutArgsInput): string | null {
  // Cannot create and delete at the same time
  if (hasCreateFlag && hasDeleteFlag) {
    return i18n.t('git.checkout.conflictingFlags');
  }

  return null;
}
