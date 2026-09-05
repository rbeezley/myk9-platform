/**
 * Fail loudly when a workspace package's built `dist/` is OLDER than its
 * `src/`. The app's tests and `tsc` consume each package's `dist/`, not `src/`, so
 * after editing a package and running app tests without rebuilding, two
 * things lie at once: tests pass against the old build (a false pass), and
 * `tsc` reports errors about generated DB types that are not in your code (a
 * false failure — CLAUDE.md LESSONS, `packages/supabase/dist/index.d.ts`).
 * CI always builds packages first, so this trap is local-only, which is why
 * it lives in the app's `test` script rather than in a workflow.
 *
 * Packages whose `main` points at `src/` (test-utils) have no build and are
 * skipped; a package with no `dist/` at all is reported as stale.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface StalePackage {
  name: string;
  reason: string;
}

function newestMtime(dir: string): number {
  let newest = 0;
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else newest = Math.max(newest, statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

/** `packages` may be restricted (the app's workspace deps); default is every dir under packages/. */
export function findStalePackages(root: string, packages?: readonly string[]): StalePackage[] {
  const pkgRoot = join(root, 'packages');
  const names =
    packages ??
    readdirSync(pkgRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  const stale: StalePackage[] = [];
  for (const name of names) {
    const dir = join(pkgRoot, name);
    let main = '';
    try {
      main =
        (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { main?: string }).main ??
        '';
    } catch {
      continue;
    }
    if (!main.includes('dist')) continue; // consumed from src; nothing to be stale
    let distMtime: number;
    try {
      distMtime = statSync(join(dir, main)).mtimeMs;
    } catch {
      stale.push({ name, reason: `${main} is missing — never built in this checkout` });
      continue;
    }
    let srcNewest: number;
    try {
      srcNewest = newestMtime(join(dir, 'src'));
    } catch {
      continue;
    }
    if (srcNewest > distMtime) {
      stale.push({
        name,
        reason: `src/ is newer than ${main} by ${Math.round((srcNewest - distMtime) / 1000)}s`,
      });
    }
  }
  return stale;
}

export function runCli(root = process.cwd(), argv = process.argv.slice(2)): number {
  const only = argv.filter(a => !a.startsWith('--'));
  const stale = findStalePackages(root, only.length ? only : undefined);
  if (stale.length === 0) {
    console.log('check-dist-fresh: every built package is newer than its src/');
    return 0;
  }
  console.error(
    'check-dist-fresh: STALE package builds — tests and tsc would run against old code:'
  );
  for (const s of stale) console.error(`  - ${s.name}: ${s.reason}`);
  console.error(
    `Rebuild: pnpm -r --filter='./packages/*' build   (or pnpm --filter @myk9/<name> build)`
  );
  return 1;
}

/** Walk up from `from` to the pnpm workspace root, so the check runs from any package dir. */
export function findWorkspaceRoot(from: string): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`check-dist-fresh: no pnpm-workspace.yaml above ${from}`);
    dir = parent;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(findWorkspaceRoot(process.env.MYK9_REPO_ROOT ?? process.cwd()));
}
