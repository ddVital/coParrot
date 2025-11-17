import figlet from 'figlet';
import gradient from 'gradient-string';

/**
 * Generate a cool gradient header for CoParrot
 * @param {string} text - Text to display (default: "CoParrot")
 * @param {string} font - Figlet font to use (default: "Standard")
 * @returns {string} Gradient colored ASCII art
 */
export function createHeader(text = 'CoParrot', font = 'Standard') {
  const asciiArt = figlet.textSync(text, {
    font: font,
    horizontalLayout: 'default',
    verticalLayout: 'default'
  });

  // Create a cool gradient (blue to purple to pink)
  const gradientColors = gradient(['#00D4FF', '#7B2FFF', '#FF006E']);

  return gradientColors.multiline(asciiArt);
}

/**
 * Get a random cool gradient
 * @returns {function} Gradient function
 */
export function getRandomGradient() {
  const gradients = [
    // Ocean (blue to cyan)
    gradient(['#0A2463', '#3E92CC', '#00F5FF']),
    // Sunset (orange to pink)
    gradient(['#FF6B35', '#F7931E', '#FF006E']),
    // Forest (green to teal)
    gradient(['#2D6A4F', '#40916C', '#74C69D']),
    // Purple Dream
    gradient(['#7209B7', '#B5179E', '#F72585']),
    // Fire
    gradient(['#FF0000', '#FF6B00', '#FFD700']),
    // Rainbow
    gradient(['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'])
  ];

  return gradients[Math.floor(Math.random() * gradients.length)];
}

/**
 * Create an animated gradient header (cycles through colors)
 * @param {string} text - Text to display
 * @param {string} font - Figlet font
 * @param {number} duration - Animation duration in ms
 * @param {number} fps - Frames per second
 */
export async function animateHeader(text = 'CoParrot', font = 'Standard', duration = 2000, fps = 10) {
  const asciiArt = figlet.textSync(text, {
    font: font,
    horizontalLayout: 'default',
    verticalLayout: 'default'
  });

  const frameDelay = 1000 / fps;
  const frames = Math.floor(duration / frameDelay);

  const gradients = [
    gradient(['#00D4FF', '#7B2FFF', '#FF006E']),
    gradient(['#FF006E', '#7B2FFF', '#00D4FF']),
    gradient(['#7B2FFF', '#FF006E', '#00D4FF']),
  ];

  for (let i = 0; i < frames; i++) {
    console.clear();
    const currentGradient = gradients[i % gradients.length];
    console.log(currentGradient.multiline(asciiArt));
    await new Promise(resolve => setTimeout(resolve, frameDelay));
  }
}

/**
 * Display a static header with version info
 * @param {string} appName - Application name
 * @param {string} version - Version string
 * @param {string} tagline - Optional tagline
 */
export function displayHeader(appName = 'CoParrot', version = '1.0.0', tagline = null) {
  const header = createHeader(appName);
  console.log('\n' + header);

  if (version) {
    const versionGradient = gradient(['#7B2FFF', '#FF006E']);
    console.log(versionGradient(`  v${version}`));
  }

  if (tagline) {
    const taglineGradient = gradient(['#00D4FF', '#7B2FFF']);
    console.log(taglineGradient(`  ${tagline}`));
  }

  console.log('');
}

export default {
  createHeader,
  getRandomGradient,
  animateHeader,
  displayHeader
};
