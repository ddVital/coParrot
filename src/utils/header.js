import figlet from 'figlet';
import gradient from 'gradient-string';
import chalk from 'chalk';
import i18n from '../services/i18n.js';
import { getRepoStats } from './repo-stats.js';
import { VERSION } from './index.js';

/**
 * Generate a cool gradient header for CoParrot
 */
export function createHeader(text = 'CoParrot', font = 'Standard') {
  const asciiArt = figlet.textSync(text, {
    font,
    horizontalLayout: 'default',
    verticalLayout: 'default'
  });

  return gradient(['#FFFF00']).multiline(asciiArt);
}

/**
 * Get a random cool gradient
 */
export function getRandomGradient() {
  const gradients = [
    gradient(['#0A2463', '#3E92CC', '#00F5FF']), // Ocean
    gradient(['#FF6B35', '#F7931E', '#FF006E']), // Sunset
    gradient(['#2D6A4F', '#40916C', '#74C69D']), // Forest
    gradient(['#7209B7', '#B5179E', '#F72585']), // Purple
    gradient(['#FF0000', '#FF6B00', '#FFD700']), // Fire
    gradient(['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF'])
  ];

  return gradients[Math.floor(Math.random() * gradients.length)];
}

/**
 * Animated header
 */
export async function animateHeader(
  text = 'CoParrot',
  font = 'Standard',
  duration = 2000,
  fps = 10
) {
  const asciiArt = figlet.textSync(text, { font });
  const frameDelay = 1000 / fps;
  const frames = Math.floor(duration / frameDelay);

  const gradients = [
    gradient(['#00D4FF', '#7B2FFF', '#FF006E']),
    gradient(['#FF006E', '#7B2FFF', '#00D4FF']),
    gradient(['#7B2FFF', '#FF006E', '#00D4FF'])
  ];

  for (let i = 0; i < frames; i++) {
    console.clear();
    console.log(gradients[i % gradients.length].multiline(asciiArt));
    await new Promise(r => setTimeout(r, frameDelay));
  }
}

/**
 * Pixel-art parrot (10x10)
 */
export function createPixelParrot() {
  const b = chalk.rgb(0, 0, 0);       // black
  const b1 = chalk.rgb(16, 94, 162);   // dark blue
  const b2 = chalk.rgb(26, 113, 188);  // medium blue
  const y = chalk.rgb(206, 213, 34);   // yellow
  const g = chalk.rgb(91, 91, 91);    // gray

  return [
    '   ' + b('████') + '  ',
    '   ' + b('█') + b1('█') + y('█') + b2('█') + b('█') + ' ',
    '  ' + b('█') + b1('█') + y('█') + b('█') + y('█') + g('█') + b('█'),
    '  ' + b('█') + b2('███') + b('█') + g('██') + b('█'),
    ' ' + b('█') + b1('█') + b2('███') + b('█') + g('█') + b('█'),
    ' ' + b('█') + b1('█') + b2('███') + y('█') + b('██'),
    b('█') + b1('█') + b2('███') + b1('█') + b('█') + ' ',
    b('█') + b2('██') + b('█') + b1('███') + b('█'),
    ' ' + b('██') + b1('█████') + b('█'),
    b('███') + g('█') + ' ' + g('█') + ' '
  ];
}

/**
 * Pixel-art title
 */
export function createPixelTitle(text = 'COPARROT') {
  const asciiArt = figlet.textSync(text, {
    font: 'ANSI Shadow',
    horizontalLayout: 'fitted'
  });

  return gradient(['#16a34a', '#139242']).multiline(asciiArt).split('\n');
}

/**
 * Utils
 */
const stripAnsi = str => str.replace(/\x1B\[[0-9;]*m/g, '');
const visibleLength = str => stripAnsi(str).length;
const ellipsis = (str, max = 54) =>
  str && str.length > max ? str.slice(0, max - 2) + '..' : str;

/**
 * Static boxed header with title + meta info
 */
export async function displayStaticHeader(
  appName = 'CoParrot',
  {
    version = '',
    commitMessage = '',
    branch = ''
  } = {}
) {
  const titleLines = createPixelTitle(appName.toUpperCase());
  const parrotLines = createPixelParrot();
  const repoStats = await getRepoStats();

  const metaLine = `${ellipsis(repoStats?.lastCommit)} · on ${repoStats?.currentBranch}`;

  const boxWidth = 100;
  const contentWidth = boxWidth - 4;

  console.log(chalk.dim('┌──' + ' '.repeat(boxWidth - 6) + '──┐'));

  const welcome = `${i18n.t('common.version')} ${VERSION}`;
  console.log(
    chalk.dim('│  ') +
      parrotLines[0] +
      ' '.repeat(
        contentWidth -
          visibleLength(parrotLines[0]) -
          welcome.length -
          2
      ) +
      chalk.white(welcome) +
      chalk.dim('  │')
  );

  const maxLines = Math.max(
    titleLines.length + 1,
    parrotLines.length
  );

  for (let i = 0; i < maxLines; i++) {
    const parrot = parrotLines[i + 1] || '';

    // Title lines
    if (i < titleLines.length) {
      const title = titleLines[i];
      const space =
        contentWidth -
        visibleLength(title) -
        visibleLength(parrot) -
        2;

      console.log(
        chalk.dim('│  ') +
          parrot +
          ' '.repeat(Math.max(0, space)) +
          title +
          chalk.dim('  │')
      );
      continue;
    }

    // Meta line (right below title)
    if (i === titleLines.length) {
      const space =
        contentWidth -
        visibleLength(metaLine) -
        visibleLength(parrot) -
        2;

      console.log(
        chalk.dim('│  ') +
          parrot +
          ' '.repeat(Math.max(0, space)) +
          metaLine +
          chalk.dim('  │')
      );
      continue;
    }

    // Remaining parrot lines
    if (parrot.trim()) {
      console.log(
        chalk.dim('│  ') +
          parrot +
          ' '.repeat(contentWidth - visibleLength(parrot)) +
          chalk.dim('  │')
      );
    }
  }

  console.log(chalk.dim('└──' + ' '.repeat(boxWidth - 6) + '──┘'));
}

export default {
  createHeader,
  getRandomGradient,
  animateHeader,
  createPixelParrot,
  createPixelTitle,
  displayStaticHeader
};
