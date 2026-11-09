/**
 * MYK9-1787: which PRs need the phone-width walk green before the review gate is posted.
 *
 * The walk is `apps/myk9show/src/test/e2e/verification/ringsidePhoneWalk.spec.ts`. It runs
 * on every PR inside the "Isolated scoring and paperwork verification" workflow (job
 * `proof`), against the branch build and a disposable local Supabase. That workflow is not a
 * required check, so a ringside PR could merge with the walk red; this script is what makes
 * `ship-pr` wait for it on the PRs that touch a ringside or check-in desk surface.
 *
 * A declared list, never inference over file contents: a path that no longer exists exits 2
 * instead of silently matching nothing (LESSONS #comment-satisfies-grep).
 *
 *   pnpm qa:phone-walk [--base origin/main]   is the walk required for this diff?
 *   pnpm qa:phone-walk --pr <n>               ...and if so, is it green on the PR head?
 *
 * Exit: 0 not required, or required and green · 1 required and failed · 2 a declared path
 * is gone, or the answer could not be read · 3 required and not finished (not a verdict).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WALK_SPEC = 'apps/myk9show/src/test/e2e/verification/ringsidePhoneWalk.spec.ts';
export const WALK_CONFIG = 'apps/myk9show/playwright.batch3.config.ts';
export const WALK_WORKFLOW = 'Isolated scoring and paperwork verification';
export const WALK_JOB = 'proof';

/**
 * Ringside and check-in desk surfaces. A trailing slash is a directory prefix; anything else
 * is one file. Every entry must exist in the tree.
 */
export const PHONE_WALK_PATHS: readonly string[] = [
  'packages/ringside/',
  'packages/scoring-ui/',
  'apps/myk9show/src/features/at-show/',
  'apps/myk9show/src/components/entries/management/checkInDesk/',
  'apps/myk9show/src/services/show-day/',
  'apps/myk9show/src/pages/scoring/',
  'apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts',
  'apps/myk9show/src/services/replication/entryRingTime.ts',
  'apps/myk9show/src/hooks/useScoresheetRingMove.ts',
  'apps/myk9show/src/utils/checkInTransitions.ts',
  WALK_SPEC,
  WALK_CONFIG,
];

/** Declared paths that are not in the tree: a rename has left the list matching nothing. */
export function missingPaths(
  exists: (path: string) => boolean,
  paths: readonly string[] = PHONE_WALK_PATHS
): string[] {
  return paths.filter(path => !exists(path));
}

/** The changed files that sit on a declared surface. */
export function walkMatches(
  files: readonly string[],
  paths: readonly string[] = PHONE_WALK_PATHS
): string[] {
  return files.filter(file =>
    paths.some(path => (path.endsWith('/') ? file.startsWith(path) : file === path))
  );
}

/** True when the suite that CI runs still includes the walk. */
export function configRunsWalk(configSource: string): boolean {
  const list = /testMatch:\s*\[([^\]]*)\]/.exec(configSource)?.[1] ?? '';
  const entries = [...list.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  return entries.includes('**/ringsidePhoneWalk.spec.ts');
}

export interface PrCheck {
  name: string;
  workflow: string;
  bucket: string;
}

export interface Verdict {
  code: 0 | 1 | 3;
  message: string;
}

/** Read the walk's job off a PR's checks. Anything but a finished pass is not green. */
export function walkVerdict(checks: readonly PrCheck[]): Verdict {
  const runs = checks.filter(check => check.workflow === WALK_WORKFLOW && check.name === WALK_JOB);
  if (runs.length === 0) {
    return { code: 3, message: `no "${WALK_WORKFLOW}" run on this head yet` };
  }
  if (runs.some(run => run.bucket === 'fail' || run.bucket === 'cancel')) {
    return { code: 1, message: 'the walk failed or was cancelled on this head' };
  }
  if (runs.every(run => run.bucket === 'pass')) {
    return { code: 0, message: 'the walk is green on this head' };
  }
  return { code: 3, message: 'the walk has not finished on this head' };
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main(): number {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const gone = missingPaths(path => existsSync(resolve(root, path)));
  if (gone.length > 0) {
    console.error(`phone walk: declared path no longer exists: ${gone.join(', ')}`);
    console.error('Update PHONE_WALK_PATHS in scripts/qa/phone-walk.ts to where the code moved.');
    return 2;
  }
  if (!configRunsWalk(readFileSync(resolve(root, WALK_CONFIG), 'utf8'))) {
    console.error(`phone walk: ${WALK_CONFIG} no longer runs ringsidePhoneWalk.spec.ts`);
    return 2;
  }

  const base = flag('--base') ?? 'origin/main';
  const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const matches = walkMatches(changed);
  if (matches.length === 0) {
    console.log('phone walk: not required (no ringside or check-in desk path changed)');
    return 0;
  }
  console.log(`phone walk: required (${matches.length} file(s), first: ${matches[0]})`);

  const pr = flag('--pr');
  if (!pr) return 0;
  let checks: PrCheck[];
  try {
    // `gh pr checks` exits non-zero while checks are pending or failed and still prints them.
    const out = execFileSync('gh', ['pr', 'checks', pr, '--json', 'name,workflow,bucket'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    checks = JSON.parse(out) as PrCheck[];
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? '';
    try {
      checks = JSON.parse(stdout) as PrCheck[];
    } catch {
      console.error(`phone walk: could not read checks for PR ${pr}`);
      return 2;
    }
  }
  const verdict = walkVerdict(checks);
  console.log(`phone walk: ${verdict.message}`);
  return verdict.code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main());
}
