import chalk from 'chalk';
import logUpdate from 'log-update';
import gradient from 'gradient-string';

/**
 * Handles transient progress messages that can be updated and cleared
 * Supports multi-step progress with tree-style indicators and animations
 */
class TransientProgress {
  constructor() {
    this.steps = [];
    this.isActive = false;
    this.animationFrame = 0;
    this.animationInterval = null;
    this.shimmerOffset = 0;
  }

  /**
   * Spinner frames for different animation styles
   */
  static SPINNERS = {
    dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    line: ['|', '/', '─', '\\'],
    circle: ['◐', '◓', '◑', '◒'],
    square: ['◰', '◳', '◲', '◱'],
    arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
    pulse: ['●', '◉', '○', '◉'],
    bounce: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈']
  };

  /**
   * Start a new progress session
   */
  start() {
    this.steps = [];
    this.isActive = true;
    this.startAnimation();
  }

  /**
   * Start animation loop
   */
  startAnimation() {
    if (this.animationInterval) return;

    this.animationInterval = setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % 100;
      this.shimmerOffset = (this.shimmerOffset + 1) % 20;
      this.render();
    }, 80); // Update every 80ms for smooth animation
  }

  /**
   * Stop animation loop
   */
  stopAnimation() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  /**
   * Add or update a progress step
   * @param {string} id - Unique identifier for this step
   * @param {string} message - The message to display
   * @param {string} status - 'pending', 'running', 'success', 'error'
   * @param {Array} substeps - Optional array of substep strings
   */
  updateStep(id, message, status = 'running', substeps = []) {
    const existingIndex = this.steps.findIndex(step => step.id === id);

    const step = {
      id,
      message,
      status,
      substeps
    };

    if (existingIndex >= 0) {
      this.steps[existingIndex] = step;
    } else {
      this.steps.push(step);
    }

    this.render();
  }

  /**
   * Mark a step as completed
   * @param {string} id - Step identifier
   * @param {string} message - Optional final message
   */
  complete(id, message = null) {
    const step = this.steps.find(s => s.id === id);
    if (step) {
      step.status = 'success';
      if (message) {
        step.message = message;
      }
      this.render();
    }
  }

  /**
   * Mark a step as failed
   * @param {string} id - Step identifier
   * @param {string} message - Optional error message
   */
  error(id, message = null) {
    const step = this.steps.find(s => s.id === id);
    if (step) {
      step.status = 'error';
      if (message) {
        step.message = message;
      }
      this.render();
    }
  }

  /**
   * Remove a step from the list
   * @param {string} id - Step identifier
   */
  removeStep(id) {
    this.steps = this.steps.filter(s => s.id !== id);
    this.render();
  }

  /**
   * Apply shimmer effect to text (parrot-themed gradient)
   */
  applyShimmer(text) {
    // Parrot brand colors: greens, yellows, and vibrant accents
    const colors = [
      [34, 197, 94],   // Parrot green
      [74, 222, 128],  // Light green
      [132, 204, 22],  // Lime green
      [234, 179, 8],   // Golden yellow
      [16, 185, 129],  // Emerald
      [34, 197, 94]    // Parrot green (loop)
    ];

    const segments = text.split('');
    const shimmerText = segments.map((char, i) => {
      const position = (i + this.shimmerOffset) % colors.length;
      const [r, g, b] = colors[position];
      return chalk.rgb(r, g, b)(char);
    }).join('');

    return shimmerText;
  }

  /**
   * Get current spinner frame
   */
  getSpinner(style = 'dots') {
    const frames = TransientProgress.SPINNERS[style] || TransientProgress.SPINNERS.dots;
    return frames[this.animationFrame % frames.length];
  }

  /**
   * Render the current progress state
   */
  render() {
    if (!this.isActive) return;

    const lines = [];

    this.steps.forEach((step, index) => {
      const isLast = index === this.steps.length - 1;

      // Choose icon and styling based on status
      let icon, displayText;
      switch (step.status) {
        case 'success':
          icon = chalk.rgb(34, 197, 94)('✓');
          displayText = step.message;
          break;
        case 'error':
          icon = chalk.rgb(239, 68, 68)('✗');
          displayText = chalk.rgb(239, 68, 68)(step.message);
          break;
        case 'running':
          // Animated spinner for running state
          icon = chalk.rgb(6, 182, 212)(this.getSpinner('dots'));
          // Apply shimmer effect to the message
          displayText = this.applyShimmer(step.message);
          break;
        case 'generating':
          // Special shimmer effect for generation (parrot green)
          icon = chalk.rgb(34, 197, 94)(this.getSpinner('pulse'));
          displayText = this.applyShimmer(step.message);
          break;
        default:
          icon = chalk.dim('○');
          displayText = chalk.dim(step.message);
      }

      // Main step line with animation
      lines.push(`${icon} ${displayText}`);

      // Render substeps with tree characters
      if (step.substeps && step.substeps.length > 0) {
        step.substeps.forEach((substep, subIndex) => {
          const isLastSub = subIndex === step.substeps.length - 1;
          const treeChar = isLastSub ? '└' : '├';
          lines.push(chalk.dim(`  ${treeChar} ${substep}`));
        });
      }
    });

    logUpdate(lines.join('\n'));
  }

  /**
   * Clear all transient messages and persist final state
   * @param {boolean} persist - If true, print final state before clearing
   */
  stop(persist = false) {
    if (!this.isActive) return;

    this.stopAnimation();

    if (persist) {
      // Render one last time to show final state
      this.render();
      logUpdate.done(); // Persist the current output
    } else {
      // Clear all transient messages
      logUpdate.clear();
    }

    this.steps = [];
    this.isActive = false;
  }

  /**
   * Quick helper: Show a single transient message
   * @param {string} message - Message to display
   * @param {string} status - Status type
   */
  showTransient(message, status = 'running') {
    this.start();
    this.updateStep('temp', message, status);
  }

  /**
   * Quick helper: Clear the transient message
   */
  clearTransient() {
    this.stop(false);
  }

  /**
   * Show a multi-step operation with automatic progress
   * Returns an object with update methods
   */
  createOperation(initialMessage, options = {}) {
    const { useShimmer = false } = options;
    const operationId = `op_${Date.now()}`;
    this.start();
    this.updateStep(operationId, initialMessage, useShimmer ? 'generating' : 'running');

    return {
      update: (message, substeps = []) => {
        this.updateStep(operationId, message, useShimmer ? 'generating' : 'running', substeps);
      },
      complete: (message = null) => {
        this.complete(operationId, message);
        // Auto-clear after a brief moment to show success
        setTimeout(() => this.stop(false), 500);
      },
      error: (message = null) => {
        this.error(operationId, message);
        setTimeout(() => this.stop(true), 1000); // Persist errors longer
      },
      substep: (substepMessage) => {
        const step = this.steps.find(s => s.id === operationId);
        if (step) {
          step.substeps = step.substeps || [];
          step.substeps.push(substepMessage);
          this.render();
        }
      },
      // Enable shimmer effect mid-operation
      enableShimmer: () => {
        const step = this.steps.find(s => s.id === operationId);
        if (step) {
          step.status = 'generating';
          this.render();
        }
      },
      // Switch back to normal spinner
      disableShimmer: () => {
        const step = this.steps.find(s => s.id === operationId);
        if (step) {
          step.status = 'running';
          this.render();
        }
      }
    };
  }

  /**
   * Create a loading operation with shimmer effect (for AI generation)
   */
  createGeneratingOperation(initialMessage) {
    return this.createOperation(initialMessage, { useShimmer: true });
  }
}

export default TransientProgress;
