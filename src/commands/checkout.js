import i18n from '../services/i18n.js';
import { parseFlag } from '../utils/args-parser.js';

/**
 * Handles git checkout operations
 * Supports:
 * - checkout -b <name>: Create and checkout new branch
 * - checkout -b --context: Generate branch name from context
 * - checkout: Interactive branch selection (TODO)
 */
export async function gitCheckout(repo, provider, args) {
  // Parse and validate arguments
  const parsedArgs = parseCheckoutArgs(args);
  if (!parsedArgs) return; // Validation failed, error already logged

  const { branchName, context, shouldCreate } = parsedArgs;
  const recentBranches = await repo.getBranches({ count: 10 });

  try {
    // Determine final branch name
    const finalBranchName = branchName || await provider.generateBranchName({
      description: context,
      recentBranches: recentBranches
    });

    // Execute the checkout operation
    if (shouldCreate) {
      // repo.createBranch(finalBranchName, true);
      console.log("creating and checking out to branch", finalBranchName);
    } else {
      // repo.checkout(finalBranchName);
      console.log("checking out to branch", finalBranchName);
    }
  } catch (error) {
    console.error(i18n.t('output.prefixes.error'), error.message);
    return;
  }
}

/**
 * Parses and validates checkout command arguments
 * Returns null if validation fails
 */
function parseCheckoutArgs(args) {
  const hasCreateFlag = args.includes('-b');
  const branchName = hasCreateFlag ? parseFlag(args, '-b')[0] : null;

  // Context can be multiple words, so join them with spaces
  const contextWords = parseFlag(args, '-c').length > 0
    ? parseFlag(args, '-c')
    : parseFlag(args, '--context');
  const context = contextWords.length > 0 ? contextWords.join(' ') : null;

  // Validate argument combinations
  const validationError = validateCheckoutArgs({ branchName, context, hasCreateFlag });
  if (validationError) {
    console.error(i18n.t('output.prefixes.error'), validationError);
    return null;
  }

  return {
    branchName,
    context,
    shouldCreate: hasCreateFlag
  };
}

/**
 * Validates checkout arguments and returns error message if invalid
 * Returns null if valid
 */
function validateCheckoutArgs({ branchName, context, hasCreateFlag }) {
  // Plain checkout with no arguments - need interactive selector (not implemented yet)
  if (!hasCreateFlag && !branchName && !context) {
    return "checkout requires arguments. Use -b <name> to create a branch or -b --context to generate one";
  }

  // -b flag requires either a branch name or context
  if (hasCreateFlag && !branchName && !context) {
    return "switch `-b` requires a branch name or --context";
  }

  // --context can only be used with -b flag
  if (context && !hasCreateFlag) {
    return "--context can only be used with -b";
  }

  // Cannot use both branch name and context together
  if (hasCreateFlag && branchName && context) {
    return "cannot use --context when branch name is provided";
  }

  return null; // Valid
}
