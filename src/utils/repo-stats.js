import { execSync } from 'child_process';
import chalk from 'chalk';
import i18n from '../services/i18n.js';

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
    // const filesChanged = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf-8' })
    // .trim()
    // .split('\n')
    // .filter(line => line.length > 0)
    // .length;

    return {
      totalCommits: parseInt(totalCommits),
      contributors,
      todayCommits,
      lastCommit,
      currentBranch,
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
export default {
  getRepoStats,
  getFunnyMessage,
};
