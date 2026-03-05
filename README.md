<div align="center">

# coParrot

**AI-powered Git assistant for the terminal**

[![npm version](https://img.shields.io/npm/v/coparrot?style=flat-square&color=black)](https://www.npmjs.com/package/coparrot)
[![npm downloads](https://img.shields.io/npm/dm/coparrot?style=flat-square&color=black)](https://www.npmjs.com/package/coparrot)
[![License](https://img.shields.io/badge/license-Non--Commercial-black?style=flat-square)](LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/ddVital/coParrot?style=flat-square&color=black)](https://github.com/ddVital/coParrot/issues)

Generate commit messages, stage files, open PRs, and automate your Git workflow with AI. Works with OpenAI, Anthropic, Google Gemini, and Ollama.

</div>

## Installation

```bash
npm install -g coparrot
```

Or with the install script (handles Node.js setup automatically):

```bash
curl -fsSL https://raw.githubusercontent.com/ddVital/coParrot/main/install.sh | bash
```

## Getting started

Run `coparrot` for the first time to go through interactive setup:

```bash
coparrot
```

Setup walks you through language, provider, model, and commit convention. If your API key is already set as an environment variable, it will be detected automatically.

### Setting up your API key

coParrot reads credentials from environment variables. Set the one for your provider:

```bash
# OpenAI
export OPENAI_API_KEY=sk-...

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
export GEMINI_API_KEY=...
```

Add the export to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.) to persist it.

For Ollama, no API key is needed. See [Ollama setup](https://docs.ollama.com/quickstart) below.

## Usage

Commands can be run from inside the interactive shell or directly from your terminal:

```bash
coparrot commit       # run a single command and exit
cpt commit            # same, using the short alias
cpt squawk --yes      # flags work the same way
```

Any command that involves AI generation accepts `-y` / `--yes` to skip the approval prompt.

## Commands

| Command | Description |
|---|---|
| `context` | Set task context to improve AI output quality |
| `add` | Stage files with an interactive, searchable list |
| `commit` | Generate an AI commit message for staged files |
| `squawk` | Commit each changed file individually with AI messages |
| `open-pr` | Generate and open a pull request via `gh` |
| `status` | Show repository status |
| `checkout` | Switch, create, or delete branches |
| `setup [step]` | Configure or update a specific setting |
| `hook` | Install or uninstall the Git commit hook |

## context

**Run this at the start of every task.** Context sets a title and description for what you are currently working on. This information is passed to every AI call, which significantly improves the quality of commit messages, branch names, and PR descriptions.

```bash
context          # set context interactively
context show     # display current context
context clear    # remove context
```

## commit

Analyzes staged changes and generates a contextual commit message. You can approve, retry, or provide custom instructions before the commit is created.

```
  AI Generated Message:
  feat: add Spanish localization

  ? What would you like to do?
  > Approve and use this message
    Retry
    Retry with custom instructions
```

## squawk

Commits each changed file individually. Useful for splitting unrelated changes or retroactively creating a clean commit history.

```bash
squawk                                      # one commit per file, with approval prompts
squawk -i                                   # interactive: configure options step by step
squawk -y                                   # skip approval prompts

squawk --group "*.json" "*.yaml"            # group matched files into a single commit
squawk --ignore "*.md" "*.txt"              # skip files matching patterns

squawk --from 2024-01-01 --to 2024-01-31              # distribute timestamps across a date range
squawk --from 2024-01-01T09:00:00 --to 2024-01-31T18:00:00   # with exact times
squawk --exclude-weekends                   # skip weekends when distributing timestamps
squawk --timezone UTC                       # timezone for timestamp distribution
```

The `--from`/`--to` flags are useful when committing work that was done over a period of time and you want the history to reflect that. Timestamps are distributed proportionally based on the size of each change.

The `-i` / `--interactive` flag prompts you to configure ignore patterns, grouping, and date ranges step by step, without needing to remember the flags.

## open-pr

Generates an AI PR title and description based on your branch commits and diff, then opens the PR using the GitHub CLI.

```bash
open-pr              # open PR against the default base branch
open-pr main         # open PR against a specific branch
```

> Requires the `gh` CLI installed and authenticated. If your branch has not been pushed yet, coParrot will push it automatically before creating the PR.

If a PR template exists in your repository (`.github/pull_request_template.md` or similar), it will be used to structure the generated body.

## checkout

```bash
checkout                  # interactive branch selection
checkout my-branch        # switch to an existing branch
checkout -b               # create a new branch (AI generates name from context)
checkout -b my-feature    # create a branch with a specific name
checkout -d               # interactively select branches to delete
checkout -d my-branch     # delete a specific branch
checkout -D my-branch     # force delete
```

When using `-b` without a name, the AI generates a branch name based on the current context. Set `context` first for better results.

## setup

Run the full setup wizard or target a specific step:

```bash
setup                  # full setup wizard
setup language         # change language
setup provider         # change provider and credentials
setup model            # change model (uses current provider)
setup convention       # change commit convention
setup custom           # update custom AI instructions
```

Available commit conventions: Conventional Commits, Gitmoji, Simple, or Custom (define your own format).

## hook

Installs a `prepare-commit-msg` Git hook in the current repository. Once installed, running `git commit` will automatically generate a commit message via coParrot and open it in your editor for review before finalizing.

```bash
hook install      # install the hook in the current repository
hook uninstall    # remove the hook
```

Installing the hook also registers a `git squawk` alias globally, so you can run squawk directly from Git without entering the coParrot shell.

## Providers

coParrot works with any text model from the supported providers. During setup, available models are fetched from the provider API and presented in a searchable list.

| Provider | Notes |
|---|---|
| OpenAI | Requires `OPENAI_API_KEY` |
| Anthropic | Requires `ANTHROPIC_API_KEY` |
| Google Gemini | Requires `GEMINI_API_KEY` |
| Ollama | No API key required, runs locally |

### Ollama

Ollama lets you run models locally without any API key. Install Ollama and pull a model before running setup:

```bash
ollama pull qwen2.5:3b-instruct
```

During setup, select Ollama as your provider and enter your Ollama server URL (default: `http://localhost:11434`). coParrot will list your locally installed models to choose from.

See the [Ollama documentation](https://ollama.com/download) for installation instructions.

## Languages

The full UI is available in English (`en`), Portuguese Brazil (`pt-BR`), and Spanish (`es`). Change language at any time with `setup language`.

## Configuration

Config is stored at `~/.coparrot/config.json`. You can also manage it via `setup` commands.

## Contributing

Bug reports and pull requests are welcome at [github.com/ddVital/coParrot](https://github.com/ddVital/coParrot).

## License

Non-commercial license. Free for personal use, modification, and non-commercial redistribution. See [LICENSE](LICENSE) for details.

<div align="center">
  <sub>Built by <a href="https://github.com/ddVital">ddVital</a></sub>
</div>
