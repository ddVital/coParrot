/**
 * System and user prompts for different LLM tasks
 * Each action returns separate system and user prompts for proper LLM API usage.
 */

export interface PromptPair {
  system: string;
  user: string;
}

export interface SystemPromptOptions {
  convention?: string;
  style?: string;
  baseInstructions?: string;
  customInstructions?: string | null;
  recentBranches?: string[];
  verbose?: boolean;
}

export interface CommitContext {
  diff: string;
  stagedFiles?: string[];
}

export interface BranchContext {
  description: string;
  recentBranches?: string[];
}

export interface PRRepository {
  name: string;
  language?: string;
}

export interface PRContext {
  repository: PRRepository;
  headBranch: string;
  baseBranch: string;
  commits: string[];
  diff: string;
  template?: string;
}

/**
 * Builds commit message prompts (system + user)
 */
export function buildCommitPrompts(
  context: CommitContext,
  convention: string = 'conventional',
  baseInstructions: string = '',
  customInstructions: string = '',
  verbose: boolean = false
): PromptPair {
  const conventionGuides: Record<string, string> = {
    conventional: `Format: <type>(<scope>): <description>
Types: ${JSON.stringify({
  feat: 'New feature', fix: 'Bug fix', docs: 'Documentation',
  style: 'Formatting (no logic change)', refactor: 'Restructure without behavior change',
  perf: 'Performance', test: 'Tests', build: 'Build/dependencies',
  ci: 'CI config', chore: 'Maintenance'
})}`,

    semantic: `Format: <emoji> <type>: <subject>
Emojis: ✨ feat, 🐛 fix, 📝 docs, ♻️ refactor, ⚡ perf, ✅ test`,

    gitmoji: `Start with a gitmoji emoji matching the change type.
Common: ✨ feature, 🐛 fix, 📝 docs, ♻️ refactor, ⚡ perf, 🔥 remove, ✅ test, ⬆️ upgrade dep`,

    angular: `Format: <type>(<scope>): <subject>
Types: build, ci, docs, feat, fix, perf, refactor, style, test`,

    custom: `Follow the custom format from config.`
  };

  const guide = conventionGuides[convention] || conventionGuides.conventional;

  const verboseHint = verbose
    ? '\n- REQUIRED: Add extended body after blank line explaining what changed and why'
    : '';

  const additionalInstructions = customInstructions
    ? `\nUser notes: ${customInstructions}`
    : '';

  const system = `Output ONLY the commit message. No quotes, explanations, or wrapping.

${guide}

Rules:
- Describe WHAT changed and WHY, not just which files were touched
- Be specific: include concrete details (function names, package names, behavior) over generic statements
- Classify by content: new capability=feat, broken behavior fixed=fix, restructure=refactor
- Imperative present tense, max 72 chars subject line
- Scope should reflect the domain (auth, api, i18n, ui), not generic (utils, core, data)${verboseHint}${baseInstructions ? `\n${baseInstructions}` : ''}${additionalInstructions}`;

  const filesInfo = context.stagedFiles?.length
    ? `\nStaged files:\n${context.stagedFiles.map(f => `- ${f}`).join('\n')}\n`
    : '';

  const user = `Generate a commit message for this diff:
${filesInfo}
${context.diff}`;

  return { system, user };
}

/**
 * Builds branch name prompts (system + user)
 */
export function buildBranchPrompts(
  context: BranchContext,
  convention: string = 'gitflow',
  baseInstructions: string = '',
  customInstructions: string = ''
): PromptPair {
  const conventionGuides: Record<string, string> = {
    gitflow: `Format: <type>/<description>
Types: feat, fix, hotfix, chore, revert, tests, release
Example: feat/user-authentication`,

    github: `Format: <type>/<description>
Types: feat, fix, docs, chore, refactor
Example: feat/add-dark-mode`,

    gitlab: `Format: <issue>-<description> or <type>/<description>
Example: 42-implement-search`,

    ticket: `Format: <ticket-id>/<description>
Example: JIRA-123/add-export`,

    custom: `Follow custom format from config.`
  };

  const guide = conventionGuides[convention] || conventionGuides.gitflow;

  const branchesSection = context.recentBranches?.length
    ? `\nRecent branches in this project (infer naming style - separator, casing, prefix patterns):\n${context.recentBranches.map(b => `- ${b}`).join('\n')}\nIgnore env branches (main, master, dev, qa, staging, prod, release, hotfix-only names) when inferring style.`
    : '';

  const additionalInstructions = customInstructions
    ? `\n\nUser notes:\n${customInstructions}`
    : '';

  const system = `Output ONLY the branch name. No quotes, explanations, or additional text.

${guide}

Rules:
- Lowercase, 3-50 chars, use hyphens as default separator
- Match separator style (- or _) from recent branches if available${branchesSection}${baseInstructions ? `\n${baseInstructions}` : ''}${additionalInstructions}`;

  const user = `Generate a branch name for this task:
${context.description}`;

  return { system, user };
}

/**
 * Builds PR description prompts (system + user)
 *
 * System prompt: Static, defines Coparrot's role and constraints
 * User prompt: Dynamic, structured context for the specific PR
 */
export function buildPRPrompts(
  context: PRContext,
  _style: string = 'detailed',
  _baseInstructions: string = '',
  _customInstructions: string = ''
): PromptPair {
  const hasTemplate = !!context.template;

  const system = hasTemplate
    ? `You are Coparrot, a PR template filler.

YOUR #1 JOB: Output the ENTIRE PR template with every section filled in. Do NOT skip or shorten sections.

CRITICAL — ANTI-HALLUCINATION:
- HTML comments in the template (<!-- e.g. ... -->) are EXAMPLES and PLACEHOLDERS, NOT real data.
- Do NOT copy, paraphrase, or expand on example content from HTML comments.
- If a section has no applicable changes in the diff, remove the HTML comment and write "N/A".
- ONLY use facts visible in the diff and commit messages. If the diff does not mention a file, test, endpoint, or behavior, do NOT include it.
- Never invent file names, test descriptions, spec files, commands, or coverage numbers.

TEMPLATE OUTPUT:
- Output the complete template from start to finish. Every heading, every section, every checkbox list.
- Replace HTML comments (<!-- ... -->) with real content from the diff, or "N/A" if not applicable.
- Keep all markdown structure: headings, tables, details blocks, horizontal rules.

CHECKBOXES:
- Change \`- [ ]\` to \`- [x]\` for items confirmed by the diff. Do NOT reword labels.
- For mutually exclusive checkbox groups (e.g. "New migration" vs "No database changes"), check the one that applies.
- For boolean sections: if nothing changed (no DB, no API, no security), check the "no impact" / "no changes" option.
- Leave a checkbox unchecked ONLY if it requires an action that was done (e.g. "self-reviewed") — those are for the author.

Do NOT wrap output in code fences. Output raw markdown directly.`
    : `You are Coparrot, a professional Git PR assistant.

Your task is to generate the pull request BODY only (the title is handled separately).

RULES:
- Write a concise PR body in markdown.
- ONLY describe what you can see in the diff and commit messages.
- Do NOT guess what files contain beyond what the diff shows.
- Do NOT invent functionality, test coverage, commands, or behavior.
- If the diff is minimal or unclear, keep the description short and factual.
- Do NOT wrap output in code fences. Output raw markdown directly.`;

  const commitsSection = context.commits?.length
    ? `## Commits (${context.headBranch} → ${context.baseBranch})\n${context.commits.map(c => `- ${c}`).join('\n')}`
    : '';

  const diffSection = context.diff
    ? `## Diff\n\`\`\`diff\n${context.diff}\n\`\`\``
    : '';

  const user = hasTemplate
    ? `Fill in the ENTIRE template below using the provided context. Output every section.

Context:
- Repository: ${context.repository.name}
- Branches: ${context.headBranch} → ${context.baseBranch}

${commitsSection}

${diffSection}

--- TEMPLATE START ---
${context.template}
--- TEMPLATE END ---

Output the filled-in template above. Include ALL sections from TEMPLATE START to TEMPLATE END.`
    : `Generate the PR body for this change.

## Repository: ${context.repository.name}
## Branches: ${context.headBranch} → ${context.baseBranch}

${commitsSection}

${diffSection}`;

  return { system, user };
}

/**
 * Builds PR title prompts (system + user)
 */
export function buildPRTitlePrompts(
  context: PRContext,
): PromptPair {
  const system = `Output ONLY the PR title. No quotes, markdown, prefixes, or explanations.

Rules:
- Under 72 characters
- Summarize the overall change in imperative tense
- Be specific: use concrete names from the diff, not generic descriptions
- ONLY describe what you can see in the diff and commit messages`;

  const commitsInfo = context.commits?.length
    ? `\nCommits:\n${context.commits.map(c => `- ${c}`).join('\n')}`
    : '';

  const user = `Generate a PR title for this change (${context.headBranch} → ${context.baseBranch}):
${commitsInfo}
Diff summary:
${context.diff}`;

  return { system, user };
}

/**
 * Generic helper to build prompts based on type
 */
export function buildPrompts(
  type: string,
  context: unknown,
  options: SystemPromptOptions = {}
): PromptPair {
  const {
    convention,
    style,
    baseInstructions = '',
    customInstructions = '',
    recentBranches = [],
    verbose = false
  } = options;

  switch (type) {
    case 'commit':
      return buildCommitPrompts(
        context as CommitContext,
        convention || 'conventional',
        baseInstructions,
        customInstructions || '',
        verbose
      );

    case 'branch':
      // Merge recentBranches into context if provided via options
      const branchCtx = context as BranchContext;
      if (recentBranches.length && !branchCtx.recentBranches?.length) {
        branchCtx.recentBranches = recentBranches;
      }
      return buildBranchPrompts(
        branchCtx,
        convention || 'gitflow',
        baseInstructions,
        customInstructions || ''
      );

    case 'pr':
      return buildPRPrompts(
        context as PRContext,
        style || 'detailed',
        baseInstructions,
        customInstructions || ''
      );

    case 'pr-title':
      return buildPRTitlePrompts(context as PRContext);

    default:
      return {
        system: `Generate the requested output only. No explanations.${baseInstructions}${customInstructions ? `\nUser notes: ${customInstructions}` : ''}`,
        user: typeof context === 'string' ? context : JSON.stringify(context)
      };
  }
}

// Legacy support - builds just the system prompt (deprecated)
export function buildSystemPrompt(type: string, options: SystemPromptOptions = {}): string {
  const prompts = buildPrompts(type, {}, options);
  return prompts.system;
}
