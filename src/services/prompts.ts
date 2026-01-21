/**
 * System prompts for different LLM tasks
 * These prompts are designed to ensure the AI returns ONLY the requested information
 * without additional explanations, formatting, or conversational text.
 */

interface SystemPromptOptions {
  convention?: string;
  style?: string;
  baseInstructions?: string;
  customInstructions?: string | null;
  recentBranches?: string[];
  verbose?: boolean;
}

/**
 * Builds a commit message prompt based on the convention type
 */
export function buildCommitPrompt(
  convention: string = 'conventional',
  baseInstructions: string = '',
  additionalInstructions: string = '',
  verbose: boolean = false
): string {
  const conventionGuides: Record<string, string> = {
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

  return `Generate commit message. Output ONLY the message, no quotes/explanations.

${guide}

Classify by CONTENT not syntax: new feature/field=feat, broken behavior fixed=fix, restructure=refactor
Scopes: i18n, auth, api, ui (not data/utils/core). Imperative mood, <72 chars${verboseHint}${baseInstructions}${additionalInstructions}`;
}

/**
 * Builds a branch name prompt based on the naming convention
 */
export function buildBranchPrompt(
  convention: string = 'gitflow',
  baseInstructions: string = '',
  additionalInstructions: string = '',
  recentBranches: string[] = []
): string {
  const conventionGuides: Record<string, string> = {
    gitflow: `Format: <type>/<description>
Types: feat, fix, hotfix, chore, revert, tests, release
Ex: feat/user-authentication`,

    github: `Format: <type>/<description>
Types: feat, fix, docs, chore, refactor
Ex: feat/add-dark-mode`,

    gitlab: `Format: <issue>-<description> or <type>/<description>
Ex: 42-implement-search`,

    ticket: `Format: <ticket-id>/<description>
Ex: JIRA-123/add-export`,

    custom: `Follow custom format from config.`
  };

  const guide = conventionGuides[convention] || conventionGuides.gitflow;

  const branchesSection = recentBranches?.length
    ? `\nRecent branches (infer naming style - separator, casing, prefix patterns):\n${recentBranches.map(b => `- ${b}`).join('\n')}\nIgnore env branches (main, master, dev, qa, staging, prod, release, hotfix-only names) when inferring style.`
    : '';

  return `Generate branch name. Output ONLY the name, no quotes/explanations.

${guide}
Rules: lowercase, 3-50 chars. Match project's separator style from recent branches (- or _) if available.${branchesSection}${baseInstructions}${additionalInstructions}

Task:`;
}

/**
 * Builds a PR description prompt based on the style
 */
export function buildPRPrompt(
  style: string = 'detailed',
  baseInstructions: string = '',
  additionalInstructions: string = ''
): string {
  const styleGuides: Record<string, string> = {
    detailed: `Include: summary, detailed changes list, testing steps, breaking changes, related issues`,
    concise: `Include: brief summary, key changes bullets, quick test notes`,
    template: `## Description\n[Summary]\n## Changes\n- [List]\n## Testing\n- [Steps]\n## Notes\n- [Context]`
  };

  const guide = styleGuides[style] || styleGuides.detailed;

  return `Generate PR description in markdown. Output ONLY content, no meta-commentary.

${guide}

Analyze commits, cohesive narrative, highlight key changes.${baseInstructions}${additionalInstructions}`;
}

/**
 * Builds a code review prompt
 */
export function buildCodeReviewPrompt(
  style: string = 'detailed',
  baseInstructions: string = '',
  additionalInstructions: string = ''
): string {
  return `Generate code review in markdown. Output ONLY review content.

Focus: bugs, quality, perf, security, tests, docs. Style: ${style}${baseInstructions}${additionalInstructions}`;
}

/**
 * Generic helper to build system prompts
 */
export function buildSystemPrompt(type: string, options: SystemPromptOptions = {}): string {
  const {
    convention,
    style,
    baseInstructions = '',
    customInstructions = '',
    recentBranches = [],
    verbose = false
  } = options;

  const additionalInstructions = customInstructions
    ? `\n\nUser notes:\n${customInstructions}`
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
