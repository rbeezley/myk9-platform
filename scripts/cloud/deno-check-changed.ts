/**
 * `deno check` the edge functions a branch actually affects (MYK9-1397;
 * docs/plan-cloud-agent-workflow.md Task 1.1): every entrypoint whose
 * transitive relative imports reach a changed file, including `_shared`
 * code and the few `packages/` modules functions import.
 *
 *   node --import tsx scripts/cloud/deno-check-changed.ts [--base=origin/main] [--list]
 *
 * `--node-modules-dir=none` matches the edge runtime's `npm:` resolution;
 * without it Deno finds the repository's pnpm `node_modules` and refuses
 * `npm:` specifiers it cannot see there. `--no-lock` keeps a `deno.lock`
 * out of the checkout.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const FUNCTIONS_DIR = 'supabase/functions';
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const CONFIG_FILE = /^supabase\/functions\/(deno\.jsonc?|import_map\.json)$/;

function resolveImport(fromFile: string, specifier: string): string | null {
  const base = normalize(join(dirname(fromFile), specifier));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
      const resolved = match[1] === undefined ? null : resolveImport(file, match[1]);
      if (resolved) pending.push(resolved);
    }
  }
  return seen;
}

function entrypoints(root: string): string[] {
  return readdirSync(join(root, FUNCTIONS_DIR), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
    .map(entry => join(FUNCTIONS_DIR, entry.name, 'index.ts'))
    .filter(entry => existsSync(join(root, entry)))
    .sort();
}

/** Repository-relative entrypoints whose import graph contains a changed file. */
export function affectedEntrypoints(root: string, changed: readonly string[]): string[] {
  const all = entrypoints(root);
  if (changed.some(file => CONFIG_FILE.test(file))) return all;
  const changedSet = new Set(
    changed.filter(file => !/\.test\.tsx?$/.test(file)).map(file => normalize(join(root, file)))
  );
  return all.filter(entry => {
    for (const file of importClosure(join(root, entry))) if (changedSet.has(file)) return true;
    return false;
  });
}

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

export function runCli(args: string[] = process.argv.slice(2)): number {
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const baseRef = args.find(arg => arg.startsWith('--base='))?.slice(7) ?? 'origin/main';
  const mergeBase = git(root, ['merge-base', 'HEAD', baseRef]).trim();
  const changed = [
    ...git(root, ['diff', '--name-only', mergeBase]).split('\n'),
    ...git(root, ['ls-files', '--others', '--exclude-standard']).split('\n'),
  ].filter(Boolean);
  const targets = affectedEntrypoints(root, changed);
  console.log(`deno-check-changed: ${targets.length} affected entrypoint(s) since ${mergeBase}`);
  if (args.includes('--list') || targets.length === 0) {
    for (const target of targets) console.log(`  ${target}`);
    return 0;
  }
  let failed = 0;
  for (const target of targets) {
    const result = spawnSync(
      'deno',
      ['check', '--node-modules-dir=none', '--no-lock', '--quiet', target],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] }
    );
    if (result.error) {
      console.error(
        `deno-check-changed: deno not runnable (${result.error.message}); run scripts/cloud/setup.sh or install the pinned Deno`
      );
      return 2;
    }
    console.log(`  ${result.status === 0 ? 'ok  ' : 'FAIL'} ${target}`);
    if (result.status !== 0) failed++;
  }
  return failed === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = runCli();
}
