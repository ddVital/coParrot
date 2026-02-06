import { execSync } from 'child_process';
import i18n from './i18n.js';

interface GhExecError extends Error {
  stderr?: string;
}

class GithubCli {
  private authenticated: boolean = false;

  constructor() {
    this.validateGhStatus();
  }

  /**
   * Check if gh CLI is installed
   */
  private isGhInstalled(): boolean {
    try {
      execSync('gh --version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if gh CLI is authenticated
   */
  private isGhAuthenticated(): boolean {
    try {
      execSync('gh auth status', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate that GH cli is installed and authenticated
   */
  validateGhStatus(): void {
    if (!this.isGhInstalled()) {
      throw new Error(i18n.t('gh.errors.notinstalled'));
    }

    if (!this.isGhAuthenticated()) {
      throw new Error(i18n.t('gh.errors.notauthenticated'));
    }

    this.authenticated = true;
  }

  /**
   * Check if gh is ready to use
   */
  isReady(): boolean {
    return this.authenticated;
  }

  /**
   * Execute gh command
   */
  exec(command: string, cwd?: string): string {
    try {
      return execSync(command, {
        cwd: cwd || process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      const err = error as GhExecError;
      const message = err.stderr?.trim() || err.message;
      throw new Error(i18n.t('gh.errors.commandfailed', { message }));
    }
  }

  /**
   * Create a pull request
   */
  createPr(title: string, body: string, base?: string): string {
    const escapedTitle = title.replace(/'/g, "'\\''");
    const escapedBody = body.replace(/'/g, "'\\''");
    let cmd = `gh pr create --title '${escapedTitle}' --body '${escapedBody}'`;
    if (base) {
      cmd += ` --base '${base.replace(/'/g, "'\\''")}'`;
    }
    return this.exec(cmd);
  }

  /**
   * Get current repo info
   */
  getRepoInfo(): string {
    return this.exec('gh repo view --json name,owner,defaultBranchRef');
  }
}

export default GithubCli;
