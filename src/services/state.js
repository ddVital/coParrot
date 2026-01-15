import ora from 'ora';

class State {
  constructor(options = {}) {
    this.options = {
      type: options.type || "commit"
    }
  }

  async generationLoading() {
    const spinner = ora(i18n.t("general.loading"));
  }
}

export default State
