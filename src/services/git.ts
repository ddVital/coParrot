import { execSync } from 'child_process';
import path from 'path';
import i18n from './i18n.js';

// Types
export interface GitChange {
  status: string;
  statusCode: string;
  value: string;
  checked: boolean;
  additions: number;
  deletions: number;
}

interface NumStatEntry {
  additions: number;
  deletions: number;
}

interface DiffOptions {
  staged?: boolean;
  numstat?: boolean;
  nameOnly?: boolean;
  compact?: boolean;
  upstream?: boolean;
  revisionRange?: string;
}

interface LogOptions {
  limit?: number;
  oneline?: boolean;
  format?: string | null;
  since?: string | null;
  author?: string | null;
}

interface PushOptions {
  remote?: string;
  branch?: string | null;
  force?: boolean;
  setUpstream?: boolean;
}

interface PullOptions {
  remote?: string;
  branch?: string | null;
  rebase?: boolean;
}

interface BranchOptions {
  remote?: boolean;
  all?: boolean;
  count?: number;
}

interface CommitOptions {
  amend?: boolean;
  noVerify?: boolean;
  date?: Date | null;
}

interface GitExecError extends Error {
  stderr?: string;
}

/**
 * Git Repository Manager
 * Provides a clean interface for git operations with context and error handling
 */
class GitRepository {
  repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.validateRepo();
  }

  /**
   * Validate that this is a git repository
   */
  validateRepo(): void {
    try {
      this.exec('git rev-parse --git-dir');
    } catch (error) {
      throw new Error(i18n.t('git.errors.notARepository', { path: this.repoPath }));
    }
  }

  /**
   * Execute git command in repository context
   */
  exec(command: string): string {
    try {
      return execSync(command, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      const err = error as GitExecError;
      // Extract just the error message without stack trace
      const message = err.stderr?.trim() || err.message;
      throw new Error(i18n.t('git.errors.commandFailed', { message }));
    }
  }

  /**
   * Get repository status (short format)
   */
  status(): string {
    return this.exec('git status -u --short');
  }

  /**
   * Get detailed status with line counts and file information
   */
  getDetailedStatus(): GitChange[] {
    const status = this.status();

    if (!status) {
      return [];
    }

    // Get numstat for line counts
    let numstat = '';
    try {
      numstat = this.exec('git diff --numstat HEAD');
    } catch (error) {
      // If HEAD doesn't exist (new repo), try without HEAD
      try {
        numstat = this.exec('git diff --numstat');
      } catch {
        numstat = '';
      }
    }

    return this._parseStatus(status, numstat);
  }

  /**
   * Get diff for specific files or all changes
   */
  diff(files: string[] = [], options: DiffOptions = {}): string {
    const { staged = false, numstat = false, nameOnly = false, compact = false, upstream = false, revisionRange = "" } = options;

    let cmd = 'git diff';
    if (staged) cmd += ' --cached';
    if (numstat) cmd += ' --numstat';
    if (nameOnly) cmd += ' --name-only';
    if (compact) cmd += ' --unified=1 --word-diff=plain --ignore-all-space'
    if (upstream) cmd += ' @{u}..HEAD'
    if (revisionRange) cmd += ` ${revisionRange}`
    if (files.length) cmd += ` -- ${files.map(f => `"${f}"`).join(' ')}`;

    return this.exec(cmd);
  }

  /**
   * Get commit log
   */
  log(options: LogOptions = {}): string {
    const {
      limit = 10,
      oneline = true,
      format = null,
      since = null,
      author = null
    } = options;

    let cmd = 'git log';
    if (limit) cmd += ` -n ${limit}`;
    if (oneline && !format) cmd += ' --oneline';
    if (format) cmd += ` --format="${format}"`;
    if (since) cmd += ` --since="${since}"`;
    if (author) cmd += ` --author="${author}"`;

    try {
      return this.exec(cmd);
    } catch (error) {
      // No commits yet
      return '';
    }
  }

  /**
   * Stage files
   */
  add(files: string[] | string): string {
    if (!files || (Array.isArray(files) && files.length === 0)) {
      return '';
    }

    const fileList = Array.isArray(files) ? files : [files];
    return this.exec(`git add ${fileList.map(f => `"${f}"`).join(' ')}`);
  }

  /**
   * Stage all changes
   */
  addAll(): string {
    return this.exec('git add -A');
  }

  /**
   * Unstage files
   */
  restore(files: string[] | string): string {
    if (!files || (Array.isArray(files) && files.length === 0)) {
      return '';
    }

    const fileList = Array.isArray(files) ? files : [files];
    return this.exec(`git restore --staged ${fileList.map(f => `"${f}"`).join(' ')}`);
  }

  restoreAll(): string {
    return this.exec('git restore --staged .')
  }

  /**
   * Create commit
   */
  commit(message: string, options: CommitOptions = {}): string {
    const { amend = false, noVerify = false, date = null } = options;

    // Escape message properly
    const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, '\\$');

    let cmd = 'git commit';
    if (amend) cmd += ' --amend';
    if (noVerify) cmd += ' --no-verify';
    cmd += ` -m "${escapedMessage}"`;

    // If custom date provided, use environment variables to set both author and committer dates
    if (date) {
      const dateStr = date.toISOString();
      try {
        return execSync(cmd, {
          cwd: this.repoPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            GIT_AUTHOR_DATE: dateStr,
            GIT_COMMITTER_DATE: dateStr
          }
        });
      } catch (error) {
        const err = error as GitExecError;
        const errMessage = err.stderr?.trim() || err.message;
        throw new Error(i18n.t('git.errors.commandFailed', { message: errMessage }));
      }
    }

    return this.exec(cmd);
  }

  /**
   * Push to remote
   */
  push(options: PushOptions = {}): string {
    const {
      remote = 'origin',
      branch = null,
      force = false,
      setUpstream = false
    } = options;

    let cmd = `git push ${remote}`;
    if (branch) cmd += ` ${branch}`;
    if (setUpstream) cmd += ' -u';
    if (force) cmd += ' --force';

    return this.exec(cmd);
  }

  /**
   * Pull from remote
   */
  pull(options: PullOptions = {}): string {
    const { remote = 'origin', branch = null, rebase = false } = options;

    let cmd = `git pull ${remote}`;
    if (branch) cmd += ` ${branch}`;
    if (rebase) cmd += ' --rebase';

    return this.exec(cmd);
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(): string {
    try {
      return this.exec('git branch --show-current');
    } catch (error) {
      return 'main'; // Default for new repos
    }
  }

  /**
   * Get all branches
   */
  getBranches(options: BranchOptions = {}): string[] {
    const { remote = false, all = false, count = 0 } = options;

    let cmd = 'git branch';
    if (all) cmd += ' -a';
    else if (remote) cmd += ' -r';
    else if (count) cmd += ` | head -n ${count}`
            
    const output = this.exec(cmd);
    return output
      .split('\n')
      .map(b => b.trim().replace(/^\*\s+/, ''))
      .filter(Boolean);
  }

  /**
   * Create new branch
   */
  createBranch(branchName: string, checkout: boolean = false): string {
    if (checkout) {
      return this.exec(`git checkout -b ${branchName}`);
    }
    return this.exec(`git branch ${branchName}`);
  }

  /**
   * Checkout branch
   */
  checkout(branchName: string): string {
    return this.exec(`git checkout ${branchName}`);
  }

  /**
   * Get remote URL
   */
  getRemoteUrl(remote: string = 'origin'): string {
    try {
      return this.exec(`git remote get-url ${remote}`);
    } catch (error) {
      return '';
    }
  }

  /**
   * Get all remotes
   */
  getRemotes(): Array<{ name: string; url: string }> {
    try {
      const output = this.exec('git remote -v');
      const remotes = new Map();

      output.split('\n').forEach(line => {
        const [name, url, type] = line.split(/\s+/);
        if (type === '(fetch)' && name && url) {
          remotes.set(name, url);
        }
      });

      return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if working directory is clean
   */
  isClean(): boolean {
    const status = this.status();
    return status.length === 0;
  }

  /**
   * Get staged files
   */
  getStagedFiles(): string[] {
    try {
      const output = this.exec('git diff --cached --name-only');
      return output ? output.split('\n').filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get unstaged files
   */
  getUnstagedFiles(): string[] {
    try {
      const output = this.exec('git diff --name-only');
      return output ? output.split('\n').filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get untracked files
   */
  getUntrackedFiles(): string[] {
    try {
      const output = this.exec('git ls-files --others --exclude-standard');
      return output ? output.split('\n').filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get total commit count
   */
  getCommitCount(): number {
    try {
      const count = this.exec('git rev-list --count HEAD');
      return parseInt(count) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get last commit message
   */
  getLastCommitMessage(): string {
    try {
      return this.exec('git log -1 --pretty=%B');
    } catch (error) {
      return '';
    }
  }

  /**
   * Get last commit hash
   */
  getLastCommitHash(short: boolean = true): string {
    try {
      const format = short ? '--short' : '';
      return this.exec(`git rev-parse ${format} HEAD`);
    } catch (error) {
      return '';
    }
  }

  /**
   * Check if repository has uncommitted changes
   */
  hasUncommittedChanges(): boolean {
    return !this.isClean();
  }

  /**
   * Check if repository has unpushed commits
   */
  hasUnpushedCommits(): boolean {
    try {
      const output = this.exec('git log @{u}.. --oneline');
      return output.length > 0;
    } catch (error) {
      // No upstream branch set
      return false;
    }
  }

  /**
   * Stash changes
   */
  stash(message: string = ''): string {
    const cmd = message ? `git stash save "${message}"` : 'git stash';
    return this.exec(cmd);
  }

  /**
   * Apply stash
   */
  stashPop(index: number = 0): string {
    return this.exec(`git stash pop stash@{${index}}`);
  }

  /**
   * List stashes
   */
  stashList(): string[] {
    try {
      const output = this.exec('git stash list');
      return output ? output.split('\n').filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse status output into structured data
   * @private
   */
  _parseStatus(status: string, numstat: string): GitChange[] {
    const lines = status.split('\n').filter(Boolean);
    const stats = this._parseNumStat(numstat);

    return lines.map(line => {
      const statusCode = line.substring(0, 2);
      const filename = statusCode.includes('??') ? line.substring(3) : line.substring(2);

      const isStaged = statusCode[0] !== ' ' && statusCode[0] !== '?';

      return {
        status: this._getChangeType(statusCode),
        statusCode,
        value: filename.trim(),
        checked: isStaged,
        additions: stats[filename]?.additions || 0,
        deletions: stats[filename]?.deletions || 0
      };
    });
  }

  /**
   * Parse numstat output
   * @private
   */
  _parseNumStat(numstat: string): Record<string, NumStatEntry> {
    const stats: Record<string, NumStatEntry> = {};

    if (!numstat) return stats;

    const lines = numstat.split('\n').filter(Boolean);

    lines.forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const [additions, deletions, filename] = parts;
        stats[filename] = {
          additions: additions === '-' ? 0 : parseInt(additions) || 0,
          deletions: deletions === '-' ? 0 : parseInt(deletions) || 0
        };
      }
    });

    return stats;
  }

  /**
   * Map git status codes to human-readable types with staging info
   * @private
   */
  _getChangeType(status: string): string {
    const map: Record<string, string> = {
      // Staged changes (first char is the change)
      'M ': 'staged-modified',
      'A ': 'staged-added',
      'D ': 'staged-deleted',
      'R ': 'staged-renamed',
      'C ': 'staged-copied',

      // Unstaged changes (second char is the change)
      ' M': 'modified',
      ' D': 'deleted',
      ' A': 'added',

      // Both staged and modified again
      'MM': 'staged-and-modified',
      'AM': 'staged-and-modified',
      'MD': 'staged-and-deleted',
      'AD': 'staged-and-deleted',

      // Special cases
      '??': 'untracked',
      '!!': 'ignored',
      'UU': 'conflict',
      'AA': 'conflict',
      'DD': 'conflict'
    };
    return map[status] || 'unknown';
  }
}

export default GitRepository;
