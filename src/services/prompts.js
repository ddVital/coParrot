/**
 * System prompts for different LLM tasks
 * These prompts are designed to ensure the AI returns ONLY the requested information
 * without additional explanations, formatting, or conversational text.
 */

/**
 * Builds a commit message prompt based on the convention type
 * @param {string} convention - The commit convention type (e.g., 'conventional', 'semantic', 'gitmoji')
 * @param {string} baseInstructions - Custom instructions from user config
 * @param {string} additionalInstructions - Runtime custom instructions
 * @param {boolean} verbose - Whether to generate detailed commit messages with extended descriptions
 * @returns {string} The complete system prompt
 */
export function buildCommitPrompt(convention = 'conventional', baseInstructions = '', additionalInstructions = '', verbose = false) {
  const conventionGuides = {
    conventional: `Format: <type>[scope]: <description>
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
Example: "feat(auth): add user login"`,

    semantic: `Format: <emoji> <type>: <subject>
Emojis: ✨ feat, 🐛 fix, 📝 docs, ♻️ refactor
Example: "✨ feat: implement authentication"`,

    gitmoji: `Start with gitmoji: ✨ feature, 🐛 fix, 📝 docs, ♻️ refactor
Example: "✨ Add dark mode toggle"`,

    angular: `Format: <type>(scope): <subject>
Types: build, ci, docs, feat, fix, perf, refactor, style, test
Example: "feat(core): implement lazy loading"`,

    custom: `Follow the custom format from config.`
  };

  const guide = conventionGuides[convention] || conventionGuides.conventional;

  const verboseHint = verbose
    ? '\n- REQUIRED: Add extended body after blank line explaining what changed and why'
    : '\n- Add extended body (blank line + details) only for complex/breaking changes';

  return `Generate git commit message. Output ONLY the message, no quotes, no explanations.

${guide}

CRITICAL: Ignore diff syntax (commas, braces, brackets). Look at CONTENT being added/removed.
- Adding new field/function/file = feat or chore (NOT fix)
- Fixing incorrect behavior = fix
- Modifying existing code without changing behavior = refactor
- Use specific scopes: i18n, auth, api, ui (NOT data, utils, core)
- Imperative mood, <72 chars first line${verboseHint}${baseInstructions}${additionalInstructions}`;
}

/**
 * Builds a branch name prompt based on the naming convention
 * @param {string} convention - The branch naming convention (e.g., 'gitflow', 'github', 'gitlab')
 * @param {string} baseInstructions - Custom instructions from user config
 * @param {string} additionalInstructions - Runtime custom instructions
 * @param {Array} recentBranches - Recent branch names from the repository (optional)
 * @returns {string} The complete system prompt
 */
export function buildBranchPrompt(convention = 'gitflow', baseInstructions = '', additionalInstructions = '', recentBranches = []) {
  const conventionGuides = {
    gitflow: `Format: <type>/<description>
Types: feat, fix, hotfix, chore, revert, tests, release
Example: "feat/user-authentication"`,

    github: `Format: <type>/<description>
Types: feat, fix, docs, chore, refactor
Example: "feat/add-dark-mode"`,

    gitlab: `Format: <issue>-<description> or <type>/<description>
Example: "42-implement-search"`,

    ticket: `Format: <ticket-id>/<description>
Example: "JIRA-123/add-export"`,

    custom: `Follow custom format from config.`
  };

  const guide = conventionGuides[convention] || conventionGuides.gitflow;

  // Build recent branches section if available
  let branchesSection = '';
  if (recentBranches && recentBranches.length > 0) {
    branchesSection = `\n\nRecent branches in this project (follow the same naming pattern):\n${recentBranches.map(b => `- ${b}`).join('\n')}`;
  }

  return `You are a git branch name generator. You will receive a task description and must generate a conventional git branch name based on it.

RULES:
${guide}
- Use lowercase letters only
- Use kebab-case (words separated by hyphens)
- Keep it concise but descriptive (3-50 characters)
- Choose the appropriate type (feat/fix/chore/etc.) based on the task description${branchesSection}

OUTPUT FORMAT: Return ONLY the branch name, no quotes, no explanations, no git commands, no markdown.

TASK DESCRIPTION (generate branch name from this):`;
}

/**
 * Builds a PR description prompt based on the style
 * @param {string} style - The PR description style (e.g., 'detailed', 'concise', 'template')
 * @param {string} baseInstructions - Custom instructions from user config
 * @param {string} additionalInstructions - Runtime custom instructions
 * @returns {string} The complete system prompt
 */
export function buildPRPrompt(style = 'detailed', baseInstructions = '', additionalInstructions = '') {
  const styleGuides = {
    detailed: `Include: summary, detailed changes list, testing steps, breaking changes, related issues`,
    concise: `Include: brief summary, key changes bullets, quick test notes`,
    template: `## Description\n[Summary]\n## Changes\n- [List]\n## Testing\n- [Steps]\n## Notes\n- [Context]`
  };

  const guide = styleGuides[style] || styleGuides.detailed;

  return `Generate a PR description. Output ONLY the description content with markdown formatting. No meta-commentary, no wrapper quotes.

${guide}

Analyze commits, create cohesive narrative, highlight important changes.${baseInstructions}${additionalInstructions}`;
}

/**
 * Builds a code review prompt
 * @param {string} style - The review style (e.g., 'detailed', 'quick')
 * @param {string} baseInstructions - Custom instructions from user config
 * @param {string} additionalInstructions - Runtime custom instructions
 * @returns {string} The complete system prompt
 */
export function buildCodeReviewPrompt(style = 'detailed', baseInstructions = '', additionalInstructions = '') {
  return `Generate a code review. Output ONLY the review with markdown formatting. No meta-commentary.

Focus: bugs, quality, performance, security, testing, documentation.
Style: ${style}${baseInstructions}${additionalInstructions}`;
}

/**
 * Generic helper to build system prompts
 * @param {string} type - The type of prompt (commit, branch, pr, review)
 * @param {Object} options - Configuration options
 * @returns {string} The complete system prompt
 */
export function buildSystemPrompt(type, options = {}) {
  const {
    convention,
    style,
    baseInstructions = '',
    customInstructions = '',
    recentBranches = [],
    verbose = false
  } = options;

  const additionalInstructions = customInstructions
    ? `\n\nADDITIONAL USER INSTRUCTIONS:\n${customInstructions}`
    : '';

  switch (type) {
    case 'commit':
      return buildCommitPrompt(
        convention || 'conventional',
        baseInstructions,
        additionalInstructions,
        verbose
      );

    case 'branch':
      return buildBranchPrompt(
        convention || 'gitflow',
        baseInstructions,
        additionalInstructions,
        recentBranches
      );

    case 'pr':
      return buildPRPrompt(
        style || 'detailed',
        baseInstructions,
        additionalInstructions
      );

    case 'review':
      return buildCodeReviewPrompt(
        style || 'detailed',
        baseInstructions,
        additionalInstructions
      );

    default:
      return `Generate the requested output only. No explanations.${baseInstructions}${additionalInstructions}`;
  }
}
