#!/usr/bin/env tsx
/**
 * Integration smoke test for coParrot
 *
 * Creates real git repos, applies changes, and runs coParrot commands against
 * real LLM providers. Useful for validating end-to-end behaviour across
 * providers without touching any config files manually.
 *
 * Usage:
 *   tsx tests/integration/smoke-test.ts [options]
 *
 * Options:
 *   --providers <list>   Comma-separated providers to test
 *                        Default: auto-detect from env vars
 *   --scenarios <list>   Comma-separated scenarios (fresh,modified,mixed)
 *                        Default: all
 *   --keep               Keep temp repos after test for manual inspection
 *   --help, -h           Show this help
 *
 * Environment variables (at least one required):
 *   OPENAI_API_KEY       OpenAI
 *   ANTHROPIC_API_KEY    Claude / Anthropic
 *   GEMINI_API_KEY       Google Gemini
 *   OLLAMA_URL           Ollama server (default: http://localhost:11434)
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '../..');
const BIN_PATH = join(ROOT_DIR, 'bin', 'index.ts');
const TSX_BIN = join(ROOT_DIR, 'node_modules', '.bin', 'tsx');

// ─── CLI Arg Parsing ──────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getFlag(name: string): boolean {
  return argv.includes(name);
}

function getFlagValue(name: string): string | null {
  const idx = argv.indexOf(name);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : null;
}

if (getFlag('--help') || getFlag('-h')) {
  console.log(`
${chalk.bold.cyan('coParrot Integration Smoke Test')}

Usage:
  tsx tests/integration/smoke-test.ts [options]

Options:
  --providers <list>   Providers to test: openai,claude,gemini,ollama
                       Default: auto-detected from environment variables
  --scenarios <list>   Scenarios to run: fresh,modified,mixed
                       Default: all
  --keep               Keep temp repos after test (for manual inspection)
  --help, -h           Show this help

Required env vars (at least one):
  OPENAI_API_KEY       OpenAI API key
  ANTHROPIC_API_KEY    Anthropic / Claude API key
  GEMINI_API_KEY       Google Gemini API key
  OLLAMA_URL           Ollama server URL (default: http://localhost:11434)
`);
  process.exit(0);
}

const KEEP_REPOS = getFlag('--keep');
const PROVIDERS_FLAG = getFlagValue('--providers');
const SCENARIOS_FLAG = getFlagValue('--scenarios');

// ─── Provider Definitions ─────────────────────────────────────────────────────

/**
 * Resolve the model to use for a provider.
 * Priority: SMOKE_<PROVIDER>_MODEL env var → real coParrot config (if provider matches) → null (SDK default)
 */
function resolveModel(providerName: string): string | null {
  const envKey = `SMOKE_${providerName.toUpperCase()}_MODEL`;
  if (process.env[envKey]) return process.env[envKey]!;
  try {
    const configPath = join(homedir(), '.config', 'coparrot', 'config.json');
    if (!existsSync(configPath)) return null;
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.provider === providerName && config.model) return config.model;
  } catch {}
  return null;
}

function detectOllamaModel(): string {
  if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL;
  const result = spawnSync('ollama', ['list'], { encoding: 'utf-8' });
  if (result.status !== 0 || !result.stdout) return 'llama3';
  // Output lines: "NAME  ID  SIZE  MODIFIED" — skip header, grab first model name
  const models = result.stdout.trim().split('\n').slice(1)
    .map(line => line.trim().split(/\s+/)[0])
    .filter(Boolean);
  return models[0] ?? 'llama3';
}

interface ProviderDef {
  name: string;
  envVar: string;
  configOverride: Record<string, unknown>;
}

const ALL_PROVIDERS: ProviderDef[] = [
  {
    name: 'openai',
    envVar: 'OPENAI_API_KEY',
    configOverride: { provider: 'openai', model: resolveModel('openai') },
  },
  {
    name: 'claude',
    envVar: 'ANTHROPIC_API_KEY',
    configOverride: { provider: 'claude', model: resolveModel('claude') },
  },
  {
    name: 'gemini',
    envVar: 'GEMINI_API_KEY',
    configOverride: { provider: 'gemini', model: resolveModel('gemini') },
  },
  {
    name: 'ollama',
    envVar: 'OLLAMA_URL',
    configOverride: {
      provider: 'ollama',
      model: detectOllamaModel(),
      ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    },
  },
];

// ─── Scenario Definitions ─────────────────────────────────────────────────────

interface Step {
  label: string;
  type: 'git' | 'coparrot';
  args: string[];
}

interface Scenario {
  name: string;
  description: string;
  setup(dir: string): void;
  steps: Step[];
}

const ALL_SCENARIOS: Scenario[] = [
  {
    name: 'fresh',
    description: 'Brand-new repo with untracked files — status then initial commit',
    setup(dir) {
      gitExec(dir, ['init']);
      gitExec(dir, ['config', 'user.email', 'smoke@test.local']);
      gitExec(dir, ['config', 'user.name', 'Smoke Test']);
      writeRepoFile(dir, 'README.md', '# My Project\n\nA sample project.\n');
      writeRepoFile(dir, 'src/index.ts', 'export function hello(name: string): string {\n  return `Hello, ${name}!`;\n}\n');
      writeRepoFile(dir, 'package.json', JSON.stringify({ name: 'my-project', version: '1.0.0', type: 'module' }, null, 2));
    },
    steps: [
      { label: 'status', type: 'coparrot', args: ['status'] },
      { label: 'git add .', type: 'git', args: ['add', '.'] },
      { label: 'commit -y', type: 'coparrot', args: ['commit', '-y'] },
    ],
  },
  {
    name: 'modified',
    description: 'Repo with history — staged modifications ready to commit',
    setup(dir) {
      gitExec(dir, ['init']);
      gitExec(dir, ['config', 'user.email', 'smoke@test.local']);
      gitExec(dir, ['config', 'user.name', 'Smoke Test']);
      // Initial commit
      writeRepoFile(dir, 'src/auth.ts', 'export function login(user: string): boolean {\n  return user === "admin";\n}\n');
      writeRepoFile(dir, 'src/utils.ts', 'export const VERSION = "1.0.0";\n');
      writeRepoFile(dir, 'README.md', '# Auth Service\n');
      gitExec(dir, ['add', '.']);
      gitExec(dir, ['commit', '-m', 'chore: initial commit']);
      // Staged changes
      writeRepoFile(dir, 'src/auth.ts', 'export function login(user: string, password: string): boolean {\n  return user === "admin" && password.length > 0;\n}\n\nexport function logout(): void {}\n');
      writeRepoFile(dir, 'src/utils.ts', 'export const VERSION = "1.1.0";\nexport const MAX_RETRIES = 3;\n');
      gitExec(dir, ['add', 'src/auth.ts', 'src/utils.ts']);
    },
    steps: [
      { label: 'status', type: 'coparrot', args: ['status'] },
      { label: 'commit -y', type: 'coparrot', args: ['commit', '-y'] },
    ],
  },
  {
    name: 'mixed',
    description: 'Mixed state — staged, unstaged, and untracked files',
    setup(dir) {
      gitExec(dir, ['init']);
      gitExec(dir, ['config', 'user.email', 'smoke@test.local']);
      gitExec(dir, ['config', 'user.name', 'Smoke Test']);
      // Initial commit
      writeRepoFile(dir, 'src/api.ts', 'export const BASE_URL = "https://api.example.com";\n');
      writeRepoFile(dir, 'src/config.ts', 'export const TIMEOUT = 5000;\n');
      gitExec(dir, ['add', '.']);
      gitExec(dir, ['commit', '-m', 'chore: initial commit']);
      // Staged: api.ts modified
      writeRepoFile(dir, 'src/api.ts', 'export const BASE_URL = "https://api.example.com";\nexport const API_VERSION = "v2";\n');
      gitExec(dir, ['add', 'src/api.ts']);
      // Unstaged: config.ts modified
      writeRepoFile(dir, 'src/config.ts', 'export const TIMEOUT = 10000;\nexport const RETRIES = 3;\n');
      // Untracked: new file
      writeRepoFile(dir, 'src/logger.ts', 'export function log(msg: string): void {\n  console.log(`[LOG] ${msg}`);\n}\n');
    },
    steps: [
      { label: 'status', type: 'coparrot', args: ['status'] },
      { label: 'commit -y (staged only)', type: 'coparrot', args: ['commit', '-y'] },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function writeRepoFile(dir: string, relPath: string, content: string): void {
  const full = join(dir, relPath);
  const parent = full.substring(0, full.lastIndexOf('/'));
  if (parent !== dir) mkdirSync(parent, { recursive: true });
  writeFileSync(full, content, 'utf-8');
}

function gitExec(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, stdio: 'pipe' });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
  }
}

function makeProviderConfig(def: ProviderDef): Record<string, unknown> {
  return {
    language: 'en',
    provider: null,
    model: null,
    apiKey: null,
    ollamaUrl: null,
    commitConvention: { type: 'conventional', format: null, verboseCommits: false },
    prTemplatePath: null,
    prMessageStyle: 'detailed',
    customInstructions: '',
    ...def.configOverride,
  };
}

function writeProviderConfig(configDir: string, def: ProviderDef): void {
  mkdirSync(configDir, { recursive: true });
  const config = makeProviderConfig(def);
  writeFileSync(join(configDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function hr(label?: string): void {
  const width = 60;
  if (!label) {
    console.log(chalk.dim('─'.repeat(width)));
    return;
  }
  const pad = Math.max(0, width - label.length - 2);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  console.log(chalk.dim('─'.repeat(left)) + ' ' + label + ' ' + chalk.dim('─'.repeat(right)));
}

// ─── Runner ───────────────────────────────────────────────────────────────────

interface RunResult {
  scenario: string;
  provider: string;
  passed: boolean;
  failedStep?: string;
  durationMs: number;
}

function runStep(step: Step, repoDir: string, configDir: string): boolean {
  const env = { ...process.env, COPARROT_CONFIG_DIR: configDir, FORCE_COLOR: '1' };

  if (step.type === 'git') {
    console.log(chalk.dim(`  $ git ${step.args.join(' ')}`));
    const result = spawnSync('git', step.args, { cwd: repoDir, stdio: 'inherit', env });
    return result.status === 0;
  }

  console.log(chalk.dim(`  $ coparrot ${step.args.join(' ')}`));
  const result = spawnSync(TSX_BIN, [BIN_PATH, ...step.args], {
    cwd: repoDir,
    stdio: 'inherit',
    env,
    timeout: 120_000,
  });
  return result.status === 0;
}

function runTest(scenario: Scenario, providerDef: ProviderDef, tempBase: string): RunResult {
  const label = `${scenario.name}/${providerDef.name}`;
  const repoDir = join(tempBase, `${scenario.name}-${providerDef.name}`);
  const configDir = join(tempBase, `config-${providerDef.name}`);

  mkdirSync(repoDir, { recursive: true });

  const started = Date.now();

  try {
    // Write per-provider config (once per provider, shared across scenarios)
    if (!existsSync(join(configDir, 'config.json'))) {
      writeProviderConfig(configDir, providerDef);
    }

    // Set up the repo
    scenario.setup(repoDir);

    // Run steps
    for (const step of scenario.steps) {
      console.log();
      hr(chalk.bold(step.label));
      const ok = runStep(step, repoDir, configDir);
      if (!ok) {
        return { scenario: scenario.name, provider: providerDef.name, passed: false, failedStep: step.label, durationMs: Date.now() - started };
      }
    }

    return { scenario: scenario.name, provider: providerDef.name, passed: true, durationMs: Date.now() - started };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { scenario: scenario.name, provider: providerDef.name, passed: false, failedStep: msg, durationMs: Date.now() - started };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function selectProviders(): ProviderDef[] {
  if (PROVIDERS_FLAG) {
    const requested = PROVIDERS_FLAG.split(',').map(s => s.trim());
    const found = requested.map(name => ALL_PROVIDERS.find(p => p.name === name)).filter(Boolean) as ProviderDef[];
    if (found.length === 0) {
      console.error(chalk.red(`No valid providers in: ${PROVIDERS_FLAG}`));
      process.exit(1);
    }
    return found;
  }

  // Auto-detect from env vars
  const detected = ALL_PROVIDERS.filter(p => {
    if (p.name === 'ollama') return !!process.env.OLLAMA_URL;
    return !!process.env[p.envVar];
  });

  return detected;
}

function selectScenarios(): Scenario[] {
  if (SCENARIOS_FLAG) {
    const requested = SCENARIOS_FLAG.split(',').map(s => s.trim());
    const found = requested.map(name => ALL_SCENARIOS.find(s => s.name === name)).filter(Boolean) as Scenario[];
    if (found.length === 0) {
      console.error(chalk.red(`No valid scenarios in: ${SCENARIOS_FLAG}`));
      process.exit(1);
    }
    return found;
  }
  return ALL_SCENARIOS;
}

async function main(): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('  coParrot Integration Smoke Test'));
  console.log(chalk.dim('  Real git repos · Real LLM calls · Real terminal output'));
  console.log();

  const providers = selectProviders();
  const scenarios = selectScenarios();

  if (providers.length === 0) {
    console.error(chalk.red('✗ No providers detected.'));
    console.error(chalk.dim('  Set at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OLLAMA_URL'));
    console.error(chalk.dim('  Or specify with: --providers openai,claude'));
    process.exit(1);
  }

  const tempBase = mkdtempSync(join(tmpdir(), 'coparrot-smoke-'));
  console.log(chalk.dim(`  Temp dir : ${tempBase}`));
  console.log(chalk.cyan(`  Providers: ${providers.map(p => p.name).join(', ')}`));
  console.log(chalk.cyan(`  Scenarios: ${scenarios.map(s => s.name).join(', ')}`));
  if (KEEP_REPOS) console.log(chalk.yellow('  Repos will be kept after test (--keep)'));
  console.log();

  const results: RunResult[] = [];

  for (const provider of providers) {
    for (const scenario of scenarios) {
      console.log();
      hr();
      console.log(
        chalk.bold(`  ■ ${chalk.cyan(scenario.name)} × ${chalk.magenta(provider.name)}`),
      );
      console.log(chalk.dim(`    ${scenario.description}`));
      console.log();

      const result = runTest(scenario, provider, tempBase);
      results.push(result);

      console.log();
      if (result.passed) {
        console.log(chalk.green(`  ✓ Passed`) + chalk.dim(` (${(result.durationMs / 1000).toFixed(1)}s)`));
      } else {
        console.log(chalk.red(`  ✗ Failed`) + chalk.dim(` — ${result.failedStep ?? 'unknown'}`));
      }
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log();
  hr();
  console.log(chalk.bold('  Results'));
  console.log();

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  const maxLabel = Math.max(...results.map(r => `${r.scenario}/${r.provider}`.length));

  for (const r of results) {
    const label = `${r.scenario}/${r.provider}`.padEnd(maxLabel);
    const duration = chalk.dim(`${(r.durationMs / 1000).toFixed(1)}s`);
    if (r.passed) {
      console.log(`  ${chalk.green('✓')} ${label}  ${duration}`);
    } else {
      console.log(`  ${chalk.red('✗')} ${label}  ${duration}  ${chalk.dim(r.failedStep ?? '')}`);
    }
  }

  console.log();
  const total = results.length;
  const summary = `  ${passed.length}/${total} passed`;
  if (failed.length === 0) {
    console.log(chalk.green.bold(summary));
  } else {
    console.log(chalk.yellow.bold(summary) + chalk.red(` · ${failed.length} failed`));
  }

  if (KEEP_REPOS) {
    console.log();
    console.log(chalk.dim('  Repos kept at: ' + tempBase));
    for (const r of results) {
      const dir = join(tempBase, `${r.scenario}-${r.provider}`);
      console.log(chalk.dim(`    ${r.scenario}/${r.provider}: ${dir}`));
    }
  } else {
    rmSync(tempBase, { recursive: true, force: true });
  }

  console.log();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(chalk.red('\nFatal error:'), err);
  process.exit(1);
});
