import ora, { Ora } from 'ora';
import i18n from './i18n.js';

interface StateOptions {
  type?: 'commit' | 'branch' | 'pr';
}

class State {
  options: StateOptions;
  spinner: Ora | null = null;

  constructor(options: StateOptions = {}) {
    this.options = {
      type: options.type || 'commit'
    };
  }

  startLoading(message?: string): Ora {
    this.spinner = ora(message || i18n.t('general.loading')).start();
    return this.spinner;
  }

  stopLoading(): void {
    this.spinner?.stop();
    this.spinner = null;
  }
}

export default State;
