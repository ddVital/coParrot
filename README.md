# 🦜 coParrot

> Your intelligent, multilingual Git assistant powered by AI

coParrot is an AI-powered CLI tool that makes Git operations smarter and more intuitive. Generate meaningful commit messages, commit files individually or in groups, and let AI understand your changes - all in your preferred language.

[![npm version](https://img.shields.io/npm/v/coparrot.svg)](https://www.npmjs.com/package/coparrot)
[![License](https://img.shields.io/badge/license-Custom-blue.svg)](LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/ddVital/coParrot.svg)](https://github.com/ddVital/coParrot/issues)

## ✨ Features

- 🤖 **AI-Generated Commit Messages** - Let AI analyze your changes and create meaningful commit messages
- 🔄 **Smart File Commits** - Commit files individually or group them by patterns
- 🌍 **Multilingual Support** - English, Portuguese (pt-BR), and Spanish
- 🎯 **Interactive File Selection** - Choose which files to stage with an intuitive interface
- ⚙️ **Flexible Configuration** - Support for OpenAI, Claude, and Gemini
- 📋 **Commit Conventions** - Conventional Commits, Gitmoji, or custom formats
- 🎨 **Beautiful CLI** - Progress bars, colors, and clean output
- 🔧 **Customizable** - Configure commit styles, branch naming, and more

## 📦 Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/ddVital/coParrot/main/install.sh | bash
```

The installer will check for Node.js, help you install it if needed, and set up coParrot globally.

### npm

```bash
npm install -g coparrot
```

## 🚀 Quick Start

### First Time Setup

Run coParrot for the first time to configure:

```bash
coparrot
```

The interactive setup will guide you through:
1. **Language Selection** - Choose your preferred language
2. **Provider Setup** - Select OpenAI, Claude, or Gemini
3. **API Key** - Enter your API key
4. **Preferences** - Configure commit conventions, code review style, etc.

### Basic Usage

```bash
# Start coParrot
coparrot

# Inside coParrot CLI
> add          # Stage files interactively
> commit       # Generate AI commit message
> squawk       # Commit each file individually
> status       # Show repository status
> setup        # Reconfigure settings
```

## 📖 Commands

### `add` - Interactive File Staging

Stage files interactively with a searchable list:

```bash
> add
```

**Features:**
- ✅ Multi-select files with Space
- 🔍 Search and filter by filename
- 📊 Shows file status (Modified, Added, Deleted, etc.)

---

### `commit` - AI-Powered Commit

Generate an AI commit message for staged files:

```bash
> commit
```

**Process:**
1. Analyzes your staged changes
2. Generates a contextual commit message
3. Shows message for approval
4. Options to approve, retry, or customize

**Example Output:**
```
══════════════════════════════════════════
  AI Generated Message:
══════════════════════════════════════════

feat: add multilingual support for Spanish

══════════════════════════════════════════

✔ What would you like to do?
  ✓ Approve and use this response
  ↻ Retry (generate a new response)
  ✎ Retry with custom instructions
```

---

### `squawk` - Individual File Commits

Commit each changed file individually with AI-generated messages:

```bash
> squawk

# With patterns
> squawk --ignore "*.md" "*.txt"
> squawk --group "*.json" "*.yaml"
```

**Options:**
- `--ignore <patterns>` - Ignore files matching glob patterns
- `--group <patterns>` - Group files by pattern (one commit per group)

**Example:**
```
🦜 Squawk Progress:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 [1/3] *.json (2 files) ............... ✓
📄 [2/3] script.js ...................... ✓
📄 [3/3] README.md ...................... ✓

✨ 3 commits created (4 files)
   • 1 group commits (2 files)
   • 2 individual commits

⏱️  Completed in 12.3s
```

**Grouping Examples:**
```bash
# Group all JSON files together, all PNG files together
> squawk --group "*.json" "*.png"

# Ignore test files, group assets
> squawk --ignore "*.test.js" --group "assets/*"

# Group by directory
> squawk --group "src/components/*" "src/utils/*"
```

---

### `status` - Repository Status

Show current repository status with changed files:

```bash
> status
```

**Displays:**
- Current branch
- Modified files
- Untracked files
- Staged files

---

### `setup` - Reconfigure Settings

Update your coParrot configuration:

```bash
> setup
```

**What you can change:**
- Language preference
- LLM provider and API key
- Model selection
- Commit message convention
- Branch naming convention
- Code review style
- PR message style
- Custom instructions

---

### `checkout` - Smart Branch Creation

Create and switch to new branches:

```bash
> checkout -b feature-branch
> checkout --ai              # AI generates branch name
```

---

## ⚙️ Configuration

### Config File Location

```
~/.coparrot/config.json
```

### Configuration Options

```json
{
  "language": "en",
  "provider": "openai",
  "apiKey": "your-api-key",
  "model": "gpt-4",
  "commitConvention": {
    "type": "conventional"
  },
  "branchNaming": {
    "type": "gitflow"
  }
}
```

### Commit Conventions

**Conventional Commits** (Default)
```
feat: add new feature
fix: resolve bug
docs: update documentation
```

**Gitmoji**
```
✨ add new feature
🐛 fix bug
📝 update documentation
```

**Simple**
```
add new feature
fix bug
update documentation
```

**Custom**
Define your own format with placeholders like `{type}`, `{scope}`, `{message}`

### Supported Providers

| Provider | Models |
|----------|--------|
| **OpenAI** | GPT-4, GPT-3.5-turbo |
| **Claude** | Claude 3 Opus, Sonnet, Haiku |
| **Gemini** | Gemini Pro |

### API Keys

- **OpenAI**: https://platform.openai.com/api-keys
- **Claude**: https://console.anthropic.com/settings/keys
- **Gemini**: https://makersuite.google.com/app/apikey

## 🌍 Multilingual Support

coParrot supports three languages:

- 🇺🇸 **English** (`en`)
- 🇧🇷 **Portuguese** (`pt-BR`)
- 🇪🇸 **Spanish** (`es`)

All UI elements, messages, and prompts are fully localized. Change language in setup:

```bash
> setup
# Select "Escolha seu idioma preferido" / "Choose your preferred language"
```

## 💡 Advanced Usage

### Automation with `--yes` flag

Skip approval prompts (use with caution):

```bash
> commit --yes
> squawk --yes
```

### Complex Grouping

Group multiple file types strategically:

```bash
# Group configs, components, and tests separately
> squawk --group "*.config.js" "src/components/*" "**/*.test.js"

# Ignore build files, group source by directory
> squawk --ignore "dist/*" "build/*" --group "src/*" "lib/*"
```

### Custom Instructions

Add persistent instructions in setup:

**Examples:**
- "Always keep messages under 50 characters"
- "Include ticket numbers from branch names"
- "Focus on performance implications"
- "Use emojis in all commit messages"

## 🏗️ Project Structure

```
coparrot/
├── bin/
│   └── index.js           # CLI entry point
├── src/
│   ├── commands/          # Command implementations
│   │   ├── add.js
│   │   ├── commit.js
│   │   ├── squawk.js
│   │   └── checkout.js
│   ├── services/          # Core services
│   │   ├── config.js      # Configuration management
│   │   ├── git.js         # Git operations
│   │   ├── llms.js        # LLM orchestration
│   │   ├── i18n.js        # Internationalization
│   │   └── prompts.js     # AI prompt templates
│   ├── lib/               # UI components
│   │   ├── cli.js         # CLI framework
│   │   ├── renderer.js    # Markdown renderer
│   │   └── streamer.js    # Streaming output
│   └── utils/             # Utilities
│       ├── glob.js        # Pattern matching
│       └── repo-stats.js  # Repository statistics
├── locales/               # Translations
│   ├── en.json
│   ├── pt-BR.json
│   └── es.json
└── package.json
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- Code structure guidelines
- How to add new commands
- Testing guidelines
- Pull request process

**Quick Links:**
- 🐛 [Report a Bug](https://github.com/ddVital/coParrot/issues)
- 💡 [Request a Feature](https://github.com/ddVital/coParrot/issues)
- 🔧 [Submit a PR](https://github.com/ddVital/coParrot/pulls)

## 📄 License

This project is licensed under a Custom Non-Commercial License - see the [LICENSE](LICENSE) file for details.

**TL;DR:**
- ✅ Free for personal use
- ✅ Can modify and redistribute (non-commercial)
- ❌ Cannot sell or use commercially without permission

## 🙏 Acknowledgments

- Built with [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), and [Google Gemini](https://deepmind.google/technologies/gemini/)
- Inspired by modern developer workflows
- Thanks to all [contributors](https://github.com/ddVital/coParrot/graphs/contributors)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/ddVital/coParrot/issues)
- **Email**: ddvital0@gmail.com
- **Discussions**: [GitHub Discussions](https://github.com/ddVital/coParrot/discussions)

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/ddVital">ddVital</a>
  <br>
  <sub>If coParrot helps you, consider giving it a ⭐️</sub>
</div>
