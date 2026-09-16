/**
 * Guard: the PRIMARY checkout must stay clean and current.
 *
 * Why this exists. On 2026-09-10 a MYK9-464 draft was left uncommitted in the
 * primary checkout. Every one of its 7 files was also touched by incoming
 * commits, so `git pull` aborted with "Your local changes would be overwritten
 * by merge" — every time, for 5 days, while 105 commits landed on origin/main.
 * The pulls were run with --quiet, so nothing surfaced. Agents all work in
 * worktrees and pull independently, so nothing downstream failed either.
 *
 * The damage was only visible much later and in unrelated shapes: the local
 * migrations directory fell 20 files behind the database, so `supabase db push
 * --dry-run` reported false drift and recommended `migration repair --status
 * reverted` on correctly-applied migrations; node_modules went 105 commits
 * stale; six packages carried stale dist.
 *
 * `.githooks/pre-commit` already blocks COMMITTING from the primary checkout
 * when worktrees are live. It cannot see this failure at all: the edits are
 * never committed. That is the gap this closes.
 *
 * CI cannot host this check — the primary checkout is a local working tree that
 * no runner can see. It has to run host-side.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Commits behind upstream before the checkout counts as stale. */
export const DEFAULT_BEHIND_LIMIT = 20;

export interface PrimaryCheckoutStatus {
  /** Absolute path of the primary working tree. */
  primaryPath: string;
  /** Branch checked out there, or null when detached. */
  branch: string | null;
  /** Tracked files with uncommitted modifications. Untracked files are excluded:
   *  they only block a pull when an incoming commit adds the same path, which is
   *  rare, and flagging them fires on harmless local scratch directories. */
  dirtyFiles: string[];
  /** Commits the checkout is behind its upstream, or null when it has none. */
  behind: number | null;
  /** Upstream ref the behind-count was measured against. */
  upstream: string | null;
}

export interface Verdict {
  ok: boolean;
  reasons: string[];
  status: PrimaryCheckoutStatus;
}

export class PrimaryCheckoutError extends Error {}

function git(args: readonly string[], cwd?: string): string {
  // execFileSync with an argv array, never a shell string: this repo's own path
  // contains a space ("AI Projects"), and a shell-interpolated command splits it
  // into two arguments (LESSONS guard-word-split).
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PrimaryCheckoutError(`git ${args.join(' ')} failed: ${message}`);
  }
}

/**
 * Resolve the primary working tree from anywhere — a linked worktree, a nested
 * worktree, or the primary itself.
 *
 * `--git-common-dir` points at the shared .git directory; its parent is the
 * primary working tree. In the primary it can come back relative (".git"), so
 * resolve against cwd before taking the parent.
 */
export function findPrimaryCheckout(cwd: string = process.cwd()): string {
  const commonDir = resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd));
  // Canonicalise: from the primary, --git-common-dir is relative and resolves
  // against an unresolved cwd, while a linked worktree's gitdir file stores an
  // already-resolved absolute path. Without this the same repo reports two
  // different strings depending on where the guard was invoked (on macOS,
  // /var vs /private/var).
  return realpathSync(dirname(commonDir));
}

export function readStatus(cwd: string = process.cwd()): PrimaryCheckoutStatus {
  const primaryPath = findPrimaryCheckout(cwd);

  // -uno excludes untracked files; --porcelain keeps the output parseable.
  const porcelain = git(['status', '--porcelain', '-uno'], primaryPath);
  const dirtyFiles = porcelain
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    // Porcelain v1 is "XY <path>"; take everything after the status pair. A
    // rename reads "R  old -> new", so keep the destination.
    .map(line => line.slice(2).trim())
    .map(entry => (entry.includes(' -> ') ? entry.split(' -> ')[1]! : entry))
    .filter(Boolean);

  let branch: string | null = null;
  try {
    const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], primaryPath);
    branch = head === 'HEAD' ? null : head;
  } catch {
    branch = null;
  }

  let upstream: string | null = null;
  let behind: number | null = null;
  if (branch) {
    try {
      upstream = git(['rev-parse', '--abbrev-ref', `${branch}@{u}`], primaryPath);
    } catch {
      upstream = null;
    }
    if (upstream) {
      try {
        // Count only the right side: commits on upstream that HEAD lacks.
        const counts = git(
          ['rev-list', '--left-right', '--count', `${branch}...${upstream}`],
          primaryPath
        );
        const right = counts.split(/\s+/)[1];
        behind = right === undefined ? null : Number.parseInt(right, 10);
        if (Number.isNaN(behind)) behind = null;
      } catch {
        behind = null;
      }
    }
  }

  return { primaryPath, branch, dirtyFiles, behind, upstream };
}

export function evaluate(
  status: PrimaryCheckoutStatus,
  behindLimit: number = DEFAULT_BEHIND_LIMIT
): Verdict {
  const reasons: string[] = [];

  if (status.dirtyFiles.length > 0) {
    reasons.push(
      `${status.dirtyFiles.length} uncommitted tracked file(s) in the primary checkout — ` +
        `these abort every \`git pull\` that touches them, silently:\n` +
        status.dirtyFiles.map(f => `    ${f}`).join('\n')
    );
  }

  if (status.behind !== null && status.behind >= behindLimit) {
    reasons.push(
      `primary checkout is ${status.behind} commits behind ${status.upstream} ` +
        `(limit ${behindLimit}) — stale deps, stale package dist, and false ` +
        `\`supabase db push --dry-run\` drift follow from this`
    );
  }

  return { ok: reasons.length === 0, reasons, status };
}

export function render(verdict: Verdict): string {
  const { status } = verdict;
  if (verdict.ok) {
    const behind =
      status.behind === null ? 'no upstream' : `${status.behind} behind ${status.upstream}`;
    return `primary-checkout: clean (${status.primaryPath}, ${status.branch ?? 'detached'}, ${behind})`;
  }

  const lines = [
    `primary-checkout: PROBLEM in ${status.primaryPath} (${status.branch ?? 'detached'})`,
    ...verdict.reasons.map(r => `  - ${r}`),
    '',
    '  The primary checkout is not a workspace — work in a worktree (CLAUDE.md',
    '  § Worktree & Merge Workflow). To clear it:',
    `    git -C "${status.primaryPath}" diff > /tmp/keep.patch   # keep a copy first`,
    `    git -C "${status.primaryPath}" restore <files>`,
    `    git -C "${status.primaryPath}" pull --ff-only`,
  ];
  return lines.join('\n');
}

export function check(
  cwd: string = process.cwd(),
  behindLimit: number = DEFAULT_BEHIND_LIMIT
): Verdict {
  return evaluate(readStatus(cwd), behindLimit);
}

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_BEHIND_LIMIT;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n < 0 ? DEFAULT_BEHIND_LIMIT : n;
}

function main(argv: readonly string[]): number {
  const warnOnly = argv.includes('--warn-only');
  const limit = parseLimit(process.env.MYK9_PRIMARY_BEHIND_LIMIT);

  let verdict: Verdict;
  try {
    verdict = check(process.cwd(), limit);
  } catch (error) {
    // Exit 2 is "could not decide", never a pass — same contract as qa:inflight.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`primary-checkout: could not determine state — ${message}\n`);
    return warnOnly ? 0 : 2;
  }

  if (verdict.ok) {
    process.stdout.write(`${render(verdict)}\n`);
    return 0;
  }

  process.stderr.write(`${render(verdict)}\n`);
  return warnOnly ? 0 : 1;
}

// Run only as a CLI, so the test file can import the exports without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
