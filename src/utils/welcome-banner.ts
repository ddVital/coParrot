import gradient from 'gradient-string';
import figlet from 'figlet';

/**
 * Display modern, minimalist welcome banner
 */
export function displayWelcomeBanner(appName: string = 'CoParrot'): void {
  const gradientTheme = gradient(['#22c55e', '#10b981']);

  const title = figlet.textSync(appName, { font: 'ANSI Shadow' });

  console.log();
  console.log(gradientTheme.multiline(title));
}

export default {
  displayWelcomeBanner
};
