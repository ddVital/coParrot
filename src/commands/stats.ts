import chalk from 'chalk';
import { parseFlag } from '../utils/args-parser.js';
import { shellEscape } from '../utils/platform.js';
import type GitRepository from '../services/git.js';

interface RepoStats {
  totalCommits: number;
  linesAdded: number;
  linesDeleted: number;
  firstCommit: string | null;
  lastCommit: string | null;
  contributors: Array<{ author: string; count: number }>;
  topFiles: Array<{ file: string; count: number }>;
  dayActivity: Record<string, number>;
}

interface UserStats {
  author: string;
  totalCommits: number;
  linesAdded: number;
  linesDeleted: number;
  firstCommit: string | null;
  lastCommit: string | null;
  topFiles: Array<{ file: string; count: number }>;
  dayActivity: Record<string, number>;
}

function getGitUser(repo: GitRepository): string {
  try {
    return repo.exec('git config user.name').trim();
  } catch {
    return '';
  }
}

function getCommitCount(repo: GitRepository, author: string, since?: string, until?: string): number {
  try {
    let cmd = `git rev-list --author=${shellEscape(author)} --count HEAD`;
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    return parseInt(repo.exec(cmd).trim()) || 0;
  } catch {
    return 0;
  }
}

function getDateRange(repo: GitRepository, author: string, since?: string, until?: string): { first: string | null; last: string | null } {
  try {
    let cmd = `git log --author=${shellEscape(author)} --format=%ad --date=short`;
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    const output = repo.exec(cmd).trim();
    if (!output) return { first: null, last: null };
    const dates = output.split('\n').filter(Boolean);
    return { last: dates[0], first: dates[dates.length - 1] };
  } catch {
    return { first: null, last: null };
  }
}

function getLinesStats(repo: GitRepository, author: string, since?: string, until?: string): { added: number; deleted: number } {
  try {
    let cmd = `git log --author=${shellEscape(author)} --numstat --format=`;
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    const output = repo.exec(cmd);
    let added = 0;
    let deleted = 0;
    output.split('\n').filter(Boolean).forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const a = parseInt(parts[0]);
        const d = parseInt(parts[1]);
        if (!isNaN(a)) added += a;
        if (!isNaN(d)) deleted += d;
      }
    });
    return { added, deleted };
  } catch {
    return { added: 0, deleted: 0 };
  }
}

function getTopFiles(repo: GitRepository, author: string, since?: string, until?: string, limit = 5): Array<{ file: string; count: number }> {
  try {
    let cmd = `git log --author=${shellEscape(author)} --name-only --format=`;
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    const output = repo.exec(cmd);
    const fileCounts: Record<string, number> = {};
    output.split('\n').filter(Boolean).forEach(file => {
      fileCounts[file] = (fileCounts[file] || 0) + 1;
    });
    return Object.entries(fileCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([file, count]) => ({ file, count }));
  } catch {
    return [];
  }
}

function getDayActivity(repo: GitRepository, author: string, since?: string, until?: string): Record<string, number> {
  const days: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  try {
    let cmd = `git log --author=${shellEscape(author)} --format=%ad --date=format:%a`;
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    const output = repo.exec(cmd);
    output.split('\n').filter(Boolean).forEach(day => {
      if (days[day] !== undefined) days[day]++;
    });
  } catch {
    // return empty days
  }
  return days;
}

function getContributors(repo: GitRepository, since?: string, until?: string, limit = 10): Array<{ author: string; count: number }> {
  try {
    let cmd = 'git shortlog -sn HEAD';
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    const output = repo.exec(cmd);
    return output
      .split('\n')
      .filter(Boolean)
      .slice(0, limit)
      .map(line => {
        const tab = line.indexOf('\t');
        return {
          count: parseInt(line.slice(0, tab).trim()) || 0,
          author: line.slice(tab + 1).trim()
        };
      });
  } catch {
    return [];
  }
}

function getRepoDateRange(repo: GitRepository, since?: string, until?: string): { first: string | null; last: string | null } {
  try {
    let cmd = 'git log --format=%ad --date=short';
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    const output = repo.exec(cmd).trim();
    if (!output) return { first: null, last: null };
    const dates = output.split('\n').filter(Boolean);
    return { last: dates[0], first: dates[dates.length - 1] };
  } catch {
    return { first: null, last: null };
  }
}

function getRepoLinesStats(repo: GitRepository, since?: string, until?: string): { added: number; deleted: number } {
  try {
    let cmd = 'git log --numstat --format=';
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    const output = repo.exec(cmd);
    let added = 0;
    let deleted = 0;
    output.split('\n').filter(Boolean).forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const a = parseInt(parts[0]);
        const d = parseInt(parts[1]);
        if (!isNaN(a)) added += a;
        if (!isNaN(d)) deleted += d;
      }
    });
    return { added, deleted };
  } catch {
    return { added: 0, deleted: 0 };
  }
}

function getRepoTopFiles(repo: GitRepository, since?: string, until?: string, limit = 5): Array<{ file: string; count: number }> {
  try {
    let cmd = 'git log --name-only --format=';
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    const output = repo.exec(cmd);
    const fileCounts: Record<string, number> = {};
    output.split('\n').filter(Boolean).forEach(file => {
      fileCounts[file] = (fileCounts[file] || 0) + 1;
    });
    return Object.entries(fileCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([file, count]) => ({ file, count }));
  } catch {
    return [];
  }
}

function getRepoDayActivity(repo: GitRepository, since?: string, until?: string): Record<string, number> {
  const days: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  try {
    let cmd = 'git log --format=%ad --date=format:%a';
    if (since) cmd += ` --since=${shellEscape(since)}`;
    if (until) cmd += ` --until=${shellEscape(until)}`;
    const output = repo.exec(cmd);
    output.split('\n').filter(Boolean).forEach(day => {
      if (days[day] !== undefined) days[day]++;
    });
  } catch {
    // return empty days
  }
  return days;
}

function printRepoStats(stats: RepoStats): void {
  const { totalCommits, linesAdded, linesDeleted, firstCommit, lastCommit, contributors, topFiles, dayActivity } = stats;

  console.log();
  console.log(chalk.bold('stats') + chalk.dim('  all contributors'));
  console.log();

  console.log(`  ${chalk.dim('commits')}        ${chalk.white.bold(totalCommits.toLocaleString())}`);
  console.log(`  ${chalk.dim('lines added')}    ${chalk.green('+' + linesAdded.toLocaleString())}`);
  console.log(`  ${chalk.dim('lines deleted')}  ${chalk.red('-' + linesDeleted.toLocaleString())}`);

  if (firstCommit && lastCommit) {
    console.log(`  ${chalk.dim('first commit')}   ${chalk.white(firstCommit)}`);
    console.log(`  ${chalk.dim('last commit')}    ${chalk.white(lastCommit)}`);
  }

  if (contributors.length > 0) {
    console.log();
    console.log(`  ${chalk.dim('top contributors')}`);
    const maxCount = contributors[0].count;
    contributors.forEach(({ author, count }) => {
      const bar = renderBar(count, maxCount);
      console.log(`    ${bar}  ${chalk.dim(count + 'x')}  ${author}`);
    });
  }

  if (topFiles.length > 0) {
    console.log();
    console.log(`  ${chalk.dim('most changed files')}`);
    const maxCount = topFiles[0].count;
    topFiles.forEach(({ file, count }) => {
      const bar = renderBar(count, maxCount);
      console.log(`    ${bar}  ${chalk.dim(count + 'x')}  ${file}`);
    });
  }

  const dayValues = Object.values(dayActivity);
  const maxDay = Math.max(...dayValues);
  if (maxDay > 0) {
    console.log();
    console.log(`  ${chalk.dim('activity by day')}`);
    Object.entries(dayActivity).forEach(([day, count]) => {
      const bar = renderBar(count, maxDay);
      console.log(`    ${chalk.dim(day.padEnd(4))}  ${bar}  ${chalk.dim(String(count))}`);
    });
  }

  console.log();
}

function renderBar(value: number, max: number, width = 16): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled));
}

function printStats(stats: UserStats): void {
  const { author, totalCommits, linesAdded, linesDeleted, firstCommit, lastCommit, topFiles, dayActivity } = stats;

  console.log();
  console.log(chalk.bold('stats') + chalk.dim(`  ${author}`));
  console.log();

  console.log(`  ${chalk.dim('commits')}        ${chalk.white.bold(totalCommits.toLocaleString())}`);
  console.log(`  ${chalk.dim('lines added')}    ${chalk.green('+' + linesAdded.toLocaleString())}`);
  console.log(`  ${chalk.dim('lines deleted')}  ${chalk.red('-' + linesDeleted.toLocaleString())}`);

  if (firstCommit && lastCommit) {
    console.log(`  ${chalk.dim('first commit')}   ${chalk.white(firstCommit)}`);
    console.log(`  ${chalk.dim('last commit')}    ${chalk.white(lastCommit)}`);
  }

  if (topFiles.length > 0) {
    console.log();
    console.log(`  ${chalk.dim('most changed files')}`);
    const maxCount = topFiles[0].count;
    topFiles.forEach(({ file, count }) => {
      const bar = renderBar(count, maxCount);
      console.log(`    ${bar}  ${chalk.dim(count + 'x')}  ${file}`);
    });
  }

  const dayValues = Object.values(dayActivity);
  const maxDay = Math.max(...dayValues);
  if (maxDay > 0) {
    console.log();
    console.log(`  ${chalk.dim('activity by day')}`);
    Object.entries(dayActivity).forEach(([day, count]) => {
      const bar = renderBar(count, maxDay);
      console.log(`    ${chalk.dim(day.padEnd(4))}  ${bar}  ${chalk.dim(String(count))}`);
    });
  }

  console.log();
}

export async function statsCommand(repo: GitRepository, args: string[] = []): Promise<void> {
  const sinceFlag = parseFlag(args, '--since')[0];
  const untilFlag = parseFlag(args, '--until')[0];
  const subcommand = args.find(a => !a.startsWith('-'));

  if (subcommand === 'all') {
    const totalCommits = (() => {
      try {
        let cmd = 'git rev-list --count HEAD';
        if (sinceFlag) cmd += ` --since=${shellEscape(sinceFlag)}`;
        if (untilFlag) cmd += ` --until=${shellEscape(untilFlag)}`;
        return parseInt(repo.exec(cmd).trim()) || 0;
      } catch { return 0; }
    })();

    if (totalCommits === 0) {
      console.log();
      console.log(chalk.dim('  no commits found'));
      console.log();
      return;
    }

    const { first: firstCommit, last: lastCommit } = getRepoDateRange(repo, sinceFlag, untilFlag);
    const { added: linesAdded, deleted: linesDeleted } = getRepoLinesStats(repo, sinceFlag, untilFlag);
    const contributors = getContributors(repo, sinceFlag, untilFlag);
    const topFiles = getRepoTopFiles(repo, sinceFlag, untilFlag);
    const dayActivity = getRepoDayActivity(repo, sinceFlag, untilFlag);

    printRepoStats({ totalCommits, linesAdded, linesDeleted, firstCommit, lastCommit, contributors, topFiles, dayActivity });
    return;
  }

  const authorFlag = parseFlag(args, '--author')[0];
  const author = authorFlag || getGitUser(repo);

  if (!author) {
    console.log(chalk.yellow('No author found. Use --author <name> or configure git user.name'));
    return;
  }

  const totalCommits = getCommitCount(repo, author, sinceFlag, untilFlag);

  if (totalCommits === 0) {
    console.log();
    console.log(chalk.dim(`  no commits found for "${author}"`));
    console.log();
    return;
  }

  const { first: firstCommit, last: lastCommit } = getDateRange(repo, author, sinceFlag, untilFlag);
  const { added: linesAdded, deleted: linesDeleted } = getLinesStats(repo, author, sinceFlag, untilFlag);
  const topFiles = getTopFiles(repo, author, sinceFlag, untilFlag);
  const dayActivity = getDayActivity(repo, author, sinceFlag, untilFlag);

  printStats({ author, totalCommits, linesAdded, linesDeleted, firstCommit, lastCommit, topFiles, dayActivity });
}
