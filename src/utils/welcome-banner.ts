import gradient from 'gradient-string';
import chalk from 'chalk';
import { getRepoStats } from './repo-stats.js';
import { VERSION } from './index.js';

/**
 * Display modern, minimalist welcome banner
 */
export async function displayWelcomeBanner(appName: string = 'CoParrot'): Promise<void> {
  const repoStats = await getRepoStats();

  // Modern gradient for app name
  const gradientTheme = gradient(['#22c55e', '#10b981']);

  // Clean title with modern font
  console.log();
  console.log('  ' + gradientTheme.multiline(`
 ██████╗ ██████╗ ██████╗  █████╗ ██████╗ ██████╗  ██████╗ ████████╗
██╔════╝██╔═══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝
██║     ██║   ██║██████╔╝███████║██████╔╝██████╔╝██║   ██║   ██║
██║     ██║   ██║██╔═══╝ ██╔══██║██╔══██╗██╔══██╗██║   ██║   ██║
╚██████╗╚██████╔╝██║     ██║  ██║██║  ██║██║  ██║╚██████╔╝   ██║
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝    ╚═╝
  `.trim()));
  console.log();

  // Minimalist info section
  const infoLines = [];

  // Version badge
  infoLines.push(
    '  ' + chalk.dim('v') + chalk.white(VERSION)
  );

  // Branch and commit in a clean single line
  if (repoStats?.currentBranch && repoStats?.lastCommit) {
    const maxCommitLength = 50;
    const truncatedCommit = repoStats.lastCommit.length > maxCommitLength
      ? repoStats.lastCommit.slice(0, maxCommitLength - 2) + '..'
      : repoStats.lastCommit;

    infoLines.push(
      '  ' +
      chalk.cyan('●') + ' ' +
      chalk.cyan(repoStats.currentBranch) +
      chalk.dim(' • ') +
      chalk.gray(truncatedCommit)
    );
  } else if (repoStats?.currentBranch) {
    infoLines.push(
      '  ' + chalk.cyan('●') + ' ' + chalk.cyan(repoStats.currentBranch)
    );
  }

  // Display info lines
  infoLines.forEach(line => console.log(line));
  console.log();

  // Minimalist separator
  console.log('  ' + chalk.dim('─'.repeat(70)));
}

export default {
  displayWelcomeBanner
};
