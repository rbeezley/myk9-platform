#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const appPrefix = path.relative(repoRoot, appRoot).replace(/\\/g, '/') + '/';
const ESLINT_CACHE_LOCATION = 'node_modules/.cache/eslint/';
const ESLINT_BIN = path.join(appRoot, 'node_modules', '.bin', 'eslint');

function gitLines(args) {
  const out = execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function refExists(ref) {
  return spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repoRoot }).status === 0;
}

const explicitBase = process.env.LINT_CHANGED_BASE;
const candidates = explicitBase ? [explicitBase] : ['origin/main', 'main'];
const baseRef = candidates.find(refExists);
if (!baseRef && explicitBase) {
  console.error(`[lint:changed] LINT_CHANGED_BASE='${explicitBase}' is not a valid ref.`);
  process.exit(1);
}

const baseLabel = baseRef ?? 'working tree only';
const changedTracked = baseRef ? gitLines(`diff --name-only --diff-filter=ACMR ${baseRef}...HEAD`) : [];
const workingTree = gitLines('diff --name-only --diff-filter=ACMR');
const untracked = gitLines('ls-files --others --exclude-standard');

const all = [...new Set([...changedTracked, ...workingTree, ...untracked])];
const lintTargets = all
  .filter((f) => f.startsWith(appPrefix))
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => f.slice(appPrefix.length))
  .filter((f) => existsSync(path.join(appRoot, f)));

if (lintTargets.length === 0) {
  console.log(`[lint:changed] No changed .ts/.tsx files in ${appPrefix} vs ${baseLabel}`);
  process.exit(0);
}

console.log(`[lint:changed] Linting ${lintTargets.length} file(s) vs ${baseLabel}`);
const result = spawnSync(
  ESLINT_BIN,
  ['--cache', '--cache-location', ESLINT_CACHE_LOCATION, ...lintTargets],
  { cwd: appRoot, stdio: 'inherit' }
);
process.exit(result.status ?? 1);
