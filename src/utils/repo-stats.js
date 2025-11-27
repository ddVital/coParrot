import { execSync } from 'child_process';
import chalk from 'chalk';

/**
 * Get cool facts about the current repository
 * @returns {Object} Repository statistics
 */
export function getRepoStats() {
  try {
    // Get total commits
    const totalCommits = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();

    // Get number of contributors
    const contributors = execSync('git shortlog -sn --all', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .length;

    // Get today's commits
    const todayCommits = execSync('git log --since="00:00:00" --oneline', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .length;

    // Get most recent commit message
    const lastCommit = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' }).trim();

    // Get current branch
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();

    // Get files changed in last commit
    const filesChanged = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .length;

    return {
      totalCommits: parseInt(totalCommits),
      contributors,
      todayCommits,
      lastCommit,
      currentBranch,
      filesChanged
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get a random funny message about coding
 * @returns {string} Funny message
 */
export function getFunnyMessage() {
  const messages = [
    "🦜 Ready to squawk some commits!",
    "🎨 May your commits be atomic and your merges conflict-free!",
    "🚀 Houston, we're ready for git-off!",
    "🔥 Let's turn coffee into commits!",
    "🎯 Aim for the stars, commit for the moon!",
    "🧙 Magic is just git commands you don't understand yet!",
    "🎸 Let's rock this repo!",
    "🌮 Taco 'bout good commit messages!",
    "🍕 Commits are like pizza - better when delivered hot and fresh!",
    "🎭 To commit or not to commit, that is never the question!",
    "🏆 Today's goal: Write commit messages future-you will understand!",
    "🎪 Welcome to the greatest show on Git!",
    "🌈 Every commit is a step towards a better codebase!",
    "🎲 May the odds be ever in your favor... and your tests passing!",
    "🎺 Jazz hands ready for some version control!",
    "🌮 Squawk responsibly!",
    "🦸 Not all heroes wear capes, some write good commit messages!",
    "🎨 Painting the town red... I mean, green! All tests passing!"
  ];

  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Display repository statistics in a single-line status bar format
 * @param {Object} stats - Repository stats object
 * @param {string} version - App version
 */
export function displayRepoStats(stats, version = '1.0.0') {
  if (!stats) return;

  const parts = [];

  // Version
  parts.push(chalk.cyan(`v${version}`));

  // Last commit (hash + message)
  if (stats.lastCommit) {
    try {
      const commitHash = execSync('git log -1 --pretty=%h', { encoding: 'utf-8' }).trim();
      const commitMsg = stats.lastCommit.split('\n')[0]; // First line only
      const shortMsg = commitMsg.length > 50 ? commitMsg.substring(0, 50) + '...' : commitMsg;
      parts.push(chalk.yellow(`#${commitHash}`) + ' ' + chalk.white(shortMsg));
    } catch (error) {
      // Skip if error
    }
  }

  // Current branch
  if (stats.currentBranch) {
    parts.push(chalk.magenta(`on ${stats.currentBranch}`));
  }

  // Join with · separator (with same padding as CoParrot text)
  const statusLine = '                          ' + parts.join(chalk.dim(' · '));

  console.log(statusLine);
  console.log();
}

export default {
  getRepoStats,
  getFunnyMessage,
  displayRepoStats
};
