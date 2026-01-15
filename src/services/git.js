import { execSync } from 'child_process';
import path from 'path';
import i18n from './i18n.js';

/**
 * Git Repository Manager
 * Provides a clean interface for git operations with context and error handling
 */
class GitRepository {
  constructor(repoPath = process.cwd()) {
    this.repoPath = repoPath;
    this.validateRepo();
  }

  /**
   * Validate that this is a git repository
   */
  validateRepo() {
    try {
      this.exec('git rev-parse --git-dir');
    } catch (error) {
      throw new Error(i18n.t('git.errors.notARepository', { path: this.repoPath }));
    }
  }

  /**
   * Execute git command in repository context
   * @param {string} command - Git command to execute
   * @returns {string} Command output
   */
  exec(command) {
    try {
      return execSync(command, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      // Extract just the error message without stack trace
      const message = error.stderr?.trim() || error.message;
      throw new Error(i18n.t('git.errors.commandFailed', { message }));
    }
  }

  /**
   * Get repository status (short format)
   * @returns {string} Git status output
   */
  status() {
    return this.exec('git status -u --short');
  }

  /**
   * Get detailed status with line counts and file information
   * @returns {Array<Object>} Array of change objects
   */
  getDetailedStatus() {
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
   * @param {Array<string>} files - Files to diff (empty for all)
   * @param {Object} options - Diff options
   * @returns {string} Diff output
   */
  diff(files = [], options = {}) {
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
   * @param {Object} options - Log options
   * @returns {string} Log output
   */
  log(options = {}) {
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
   * @param {Array<string>|string} files - Files to stage
   * @returns {string} Command output
   */
  add(files) {
    if (!files || (Array.isArray(files) && files.length === 0)) {
      return '';
    }

    const fileList = Array.isArray(files) ? files : [files];
    return this.exec(`git add ${fileList.map(f => `"${f}"`).join(' ')}`);
  }

  /**
   * Stage all changes
   * @returns {string} Command output
   */
  addAll() {
    return this.exec('git add -A');
  }

  /**
   * Unstage files
   * @param {Array<string>|string} files - Files to unstage
   * @returns {string} Command output
   */
  restore(files) {
    if (!files || (Array.isArray(files) && files.length === 0)) {
      return '';
    }

    const fileList = Array.isArray(files) ? files : [files];
    return this.exec(`git restore --staged ${fileList.map(f => `"${f}"`).join(' ')}`);
  }

  restoreAll() {
    return this.exec('git restore --staged .')
  }

  /**
   * Create commit
   * @param {string} message - Commit message
   * @param {Object} options - Commit options
   * @param {Date} options.date - Custom commit date (sets both author and committer date)
   * @returns {string} Command output
   */
  commit(message, options = {}) {
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
        const message = error.stderr?.trim() || error.message;
        throw new Error(i18n.t('git.errors.commandFailed', { message }));
      }
    }

    return this.exec(cmd);
  }

  /**
   * Push to remote
   * @param {Object} options - Push options
   * @returns {string} Command output
   */
  push(options = {}) {
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
   * @param {Object} options - Pull options
   * @returns {string} Command output
   */
  pull(options = {}) {
    const { remote = 'origin', branch = null, rebase = false } = options;

    let cmd = `git pull ${remote}`;
    if (branch) cmd += ` ${branch}`;
    if (rebase) cmd += ' --rebase';

    return this.exec(cmd);
  }

  /**
   * Get current branch name
   * @returns {string} Branch name
   */
  getCurrentBranch() {
    try {
      return this.exec('git branch --show-current');
    } catch (error) {
      return 'main'; // Default for new repos
    }
  }

  /**
   * Get all branches
   * @param {Object} options - Branch options
   * @returns {Array<string>} Branch names
   */
  getBranches(options = {}) {
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
   * @param {string} branchName - Name of new branch
   * @param {boolean} checkout - Whether to checkout the new branch
   * @returns {string} Command output
   */
  createBranch(branchName, checkout = false) {
    if (checkout) {
      return this.exec(`git checkout -b ${branchName}`);
    }
    return this.exec(`git branch ${branchName}`);
  }

  /**
   * Checkout branch
   * @param {string} branchName - Branch to checkout
   * @returns {string} Command output
   */
  checkout(branchName) {
    return this.exec(`git checkout ${branchName}`);
  }

  /**
   * Get remote URL
   * @param {string} remote - Remote name
   * @returns {string} Remote URL
   */
  getRemoteUrl(remote = 'origin') {
    try {
      return this.exec(`git remote get-url ${remote}`);
    } catch (error) {
      return '';
    }
  }

  /**
   * Get all remotes
   * @returns {Array<Object>} Array of {name, url} objects
   */
  getRemotes() {
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
   * @returns {boolean} True if clean, false otherwise
   */
  isClean() {
    const status = this.status();
    return status.length === 0;
  }

  /**
   * Get staged files
   * @returns {Array<string>} File paths
   */
  getStagedFiles() {
    try {
      const output = this.exec('git diff --cached --name-only');
      return output ? output.split('\n').filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get unstaged files
   * @returns {Array<string>} File paths
   */
  getUnstagedFiles() {
    try {
      const output = this.exec('git diff --name-only');
      return output ? output.split('\n').filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get untracked files
   * @returns {Array<string>} File paths
   */
  getUntrackedFiles() {
    try {
      const output = this.exec('git ls-files --others --exclude-standard');
      return output ? output.split('\n').filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get total commit count
   * @returns {number} Number of commits
   */
  getCommitCount() {
    try {
      const count = this.exec('git rev-list --count HEAD');
      return parseInt(count) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get last commit message
   * @returns {string} Last commit message
   */
  getLastCommitMessage() {
    try {
      return this.exec('git log -1 --pretty=%B');
    } catch (error) {
      return '';
    }
  }

  /**
   * Get last commit hash
   * @param {boolean} short - Use short hash
   * @returns {string} Commit hash
   */
  getLastCommitHash(short = true) {
    try {
      const format = short ? '--short' : '';
      return this.exec(`git rev-parse ${format} HEAD`);
    } catch (error) {
      return '';
    }
  }

  /**
   * Check if repository has uncommitted changes
   * @returns {boolean} True if there are uncommitted changes
   */
  hasUncommittedChanges() {
    return !this.isClean();
  }

  /**
   * Check if repository has unpushed commits
   * @returns {boolean} True if there are unpushed commits
   */
  hasUnpushedCommits() {
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
   * @param {string} message - Stash message
   * @returns {string} Command output
   */
  stash(message = '') {
    const cmd = message ? `git stash save "${message}"` : 'git stash';
    return this.exec(cmd);
  }

  /**
   * Apply stash
   * @param {number} index - Stash index (default: 0)
   * @returns {string} Command output
   */
  stashPop(index = 0) {
    return this.exec(`git stash pop stash@{${index}}`);
  }

  /**
   * List stashes
   * @returns {Array<string>} Stash list
   */
  stashList() {
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
  _parseStatus(status, numstat) {
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
  _parseNumStat(numstat) {
    const stats = {};

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
  _getChangeType(status) {
    const map = {
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
