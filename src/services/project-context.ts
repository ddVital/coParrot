import { readFileSync } from 'fs';
import path from 'path';
import type GitRepository from './git.js';

export interface ProjectContext {
  instructions: string | null;
  branchName: string | null;
  issueId: string | null;
}

/**
 * Extract an issue ID (e.g. ABC-123, PROJ-42) from a branch name.
 * Matches uppercase letters/digits followed by a hyphen and digits.
 * Returns the first match or null.
 */
export function extractIssueId(branchName: string): string | null {
  const match = branchName.match(/([a-zA-Z][a-zA-Z0-9]+-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Load project-specific instructions from .coparrot.md at the repo root.
 * Returns null if the file doesn't exist.
 */
export function loadProjectInstructions(repoRoot: string): string | null {
  try {
    const filePath = path.join(repoRoot, '.coparrot.md');
    const content = readFileSync(filePath, 'utf-8').trim();
    return content || null;
  } catch {
    return null;
  }
}

/**
 * Load all project-level context: .coparrot.md instructions, branch name, and issue ID.
 */
export function loadProjectContext(repo: GitRepository): ProjectContext {
  const repoRoot = repo.getRepoRoot();
  const branchName = repo.getCurrentBranch().trim() || null;
  const issueId = branchName ? extractIssueId(branchName) : null;
  const instructions = loadProjectInstructions(repoRoot);

  return { instructions, branchName, issueId };
}
