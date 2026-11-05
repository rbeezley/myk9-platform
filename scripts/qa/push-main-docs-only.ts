/**
 * pre-push guard (MYK9-1713): a push to `main` carries only docs-only-direct-to-main commits.
 *
 * The docs-only direct flow ends in `git push origin HEAD:main`, which pushes whatever HEAD is
 * (docs/lessons/README.md#docs-push-head-main). Git hands this hook one line per ref:
 * `<local ref> <local sha> <remote ref> <remote sha>`. For each line aimed at `refs/heads/main`
 * we list the files every commit in `<remote sha>..<local sha>` touches and refuse any outside
 * the scope in docs/reference/git-workflow.md § "Docs-only direct-to-`main` — full scope".
 *
 * Override (loud, never silent): MYK9_ALLOW_NON_DOCS_MAIN_PUSH=1.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const OVERRIDE_ENV = 'MYK9_ALLOW_NON_DOCS_MAIN_PUSH';
const ZERO_SHA = /^0+$/;

/** Always a PR, even when the path also matches an in-scope pattern (docs/agents/shared-rules.md). */
const OUT_OF_SCOPE: readonly RegExp[] = [
  /^(CLAUDE|AGENTS)\.md$/,
  /^docs\/agents\/shared-rules\.md$/,
  /^\.(claude|codex|agents)\//,
  /^\.github\//,
];

const IN_SCOPE: readonly RegExp[] = [
  /^docs\/.*\.md$/,
  /^apps\/[^/]+\/docs\/.*\.md$/,
  /^(README|CONTEXT|DESIGN|PRODUCT|TECHNICAL_DEBT|DEFERRED-WORK|INTENT)\.md$/,
  /^packages\/[^/]+\/README\.md$/,
  /^supabase\/functions\/[^/]+\/README\.md$/,
];

export function isDocsOnlyPath(file: string): boolean {
  return !OUT_OF_SCOPE.some(p => p.test(file)) && IN_SCOPE.some(p => p.test(file));
}

export interface MainPushRange {
  localSha: string;
  remoteSha: string;
}

/** The `refs/heads/main` updates in the hook's stdin; deletions are not content and are skipped. */
export function parseMainPushes(input: string): MainPushRange[] {
  const out: MainPushRange[] = [];
  for (const line of input.split('\n')) {
    const [, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (remoteRef !== 'refs/heads/main' || !localSha || ZERO_SHA.test(localSha)) continue;
    out.push({ localSha, remoteSha: remoteSha ?? '0' });
  }
  return out;
}

export interface Violation {
  commit: string;
  file: string;
}

const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf8' });

/**
 * Judge every commit the push adds, never the net tree diff: a source commit that a later commit
 * reverts cancels out of the tree diff yet still lands on main unreviewed. Commits already on the
 * remote are excluded by the range, so merging origin/main in adds none of main's own files; a
 * merge commit is compared with all its parents at once (`-c`), which lists only content the
 * merge itself introduced (conflict resolutions), while a merged-in local branch is judged
 * through its own commits.
 */
export function findViolations(range: MainPushRange): Violation[] {
  const revs = ZERO_SHA.test(range.remoteSha)
    ? [range.localSha, '--not', '--remotes']
    : [`${range.remoteSha}..${range.localSha}`];
  const commits = git(['rev-list', ...revs])
    .split('\n')
    .filter(Boolean);
  const violations: Violation[] = [];
  for (const commit of commits) {
    // --no-renames: both sides of a rename are listed. -z: paths with spaces stay whole.
    const files = git([
      'diff-tree',
      '-r',
      '-c',
      '--root',
      '--no-renames',
      '--no-commit-id',
      '--name-only',
      '-z',
      commit,
    ])
      .split('\0')
      .filter(Boolean);
    for (const file of new Set(files)) {
      if (!isDocsOnlyPath(file)) violations.push({ commit, file });
    }
  }
  return violations;
}

export function main(input: string): number {
  try {
    const pushes = parseMainPushes(input);
    const violations = pushes.flatMap(findViolations);
    if (violations.length === 0) return 0;
    const lines = violations.map(v => `  ${v.commit.slice(0, 12)}  ${v.file}`).join('\n');
    if (process.env[OVERRIDE_ENV] === '1') {
      process.stderr.write(
        `!!! ${OVERRIDE_ENV}=1: pushing NON-DOCS commits to main without a PR:\n${lines}\n`
      );
      return 0;
    }
    process.stderr.write(
      `PUSH BLOCKED: a push to main may carry only docs-only commits; these touch other files:\n${lines}\n` +
        `Open a PR instead (docs/reference/git-workflow.md). Override once: ${OVERRIDE_ENV}=1 git push ...\n`
    );
    return 1;
  } catch (error) {
    process.stderr.write(
      `PUSH BLOCKED: could not inspect what the push to main carries: ${String(error)}. Nothing was pushed.\n`
    );
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(readFileSync(0, 'utf8'));
}
