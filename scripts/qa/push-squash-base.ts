/**
 * pre-push guard (MYK9-1714): refuse a branch rewrite that suddenly touches files its previous tip
 * never did, because it undid newer changes on `origin/main` (docs/lessons/README.md#squash-against-merge-base).
 *
 * `git reset --soft origin/main && git commit` after another session's fetch moved `origin/main`
 * makes one commit that reverts main's newer PRs. That commit touches every reverted file, so its
 * own diff cannot reveal it; comparing it with the branch's previous tip can. For each branch push
 * (not main) that is a rewrite (previous tip is not an ancestor of the new tip), we take the files
 * the files main changed between the old and new merge-base, and refuse the ones the new tip holds
 * exactly as they were at the old merge-base, i.e. main's newer change was undone.
 *
 * Previous tip: the remote sha when it is known locally, else the newest reflog tip that is not an
 * ancestor of the new one. Neither: skip.
 * Override (loud, never silent): MYK9_ALLOW_SQUASH_BASE_REWRITE=1.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const OVERRIDE_ENV = 'MYK9_ALLOW_SQUASH_BASE_REWRITE';
const ZERO_SHA = /^0+$/;
const BASE_REF = 'refs/remotes/origin/main';

export interface BranchPush {
  localRef: string;
  localSha: string;
  remoteSha: string;
}

/** Non-main, non-deletion branch updates from the hook's stdin. */
export function parseBranchPushes(input: string): BranchPush[] {
  const out: BranchPush[] = [];
  for (const line of input.split('\n')) {
    const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (!localRef || !remoteRef || !localSha || ZERO_SHA.test(localSha)) continue;
    if (remoteRef === 'refs/heads/main' || !remoteRef.startsWith('refs/heads/')) continue;
    out.push({ localRef, localSha, remoteSha: remoteSha ?? '0' });
  }
  return out;
}

/** Run git; null when it exits non-zero (missing ref, no merge base). */
const tryGit = (args: string[]): string | null => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

const files = (from: string, to: string): Set<string> =>
  new Set(
    execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', from, to], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
  );

const isAncestor = (a: string, b: string): boolean =>
  tryGit(['merge-base', '--is-ancestor', a, b]) !== null;

/**
 * The tip this push replaces. A published remote sha wins (a fast-forward over it is no rewrite).
 * Otherwise the newest reflog entry of the local branch that is not an ancestor of the new tip:
 * `reset --soft` and `commit` each add an entry, so `@{1}` alone is main's tip, not the old work.
 */
function previousTip(push: BranchPush): string | null {
  if (!ZERO_SHA.test(push.remoteSha)) {
    const remote = tryGit(['rev-parse', '--verify', '-q', `${push.remoteSha}^{commit}`])?.trim();
    if (remote) return isAncestor(remote, push.localSha) ? null : remote;
  }
  // `git push origin HEAD:refs/heads/x` reports the local ref as HEAD; use the branch it names.
  const localRef =
    push.localRef === 'HEAD'
      ? (tryGit(['symbolic-ref', '-q', 'HEAD'])?.trim() ?? '')
      : push.localRef;
  if (!localRef.startsWith('refs/heads/')) return null;
  const entries = tryGit(['log', '-g', '--format=%H', '-n', '50', localRef]) ?? '';
  return entries.split('\n').find(sha => sha && !isAncestor(sha, push.localSha)) ?? null;
}

/**
 * Files this rewrite puts back to main's OLDER content: origin/main changed them between the old
 * and new merge-base, yet the new tip holds them exactly as they were at the old merge-base
 * (both absent counts). That is the reset-onto-a-moved-main signature. Judging content, not file
 * names, lets a rebase onto the new main followed by real edits to the same files through.
 */
export function findSuspectFiles(push: BranchPush): string[] {
  const prev = previousTip(push);
  if (!prev || prev === push.localSha) return [];
  if (tryGit(['rev-parse', '--verify', '-q', BASE_REF]) === null) return [];
  const oldBase = tryGit(['merge-base', prev, BASE_REF])?.trim();
  const newBase = tryGit(['merge-base', push.localSha, BASE_REF])?.trim();
  if (!oldBase || !newBase || oldBase === newBase) return [];
  const differsFromOldBase = files(oldBase, push.localSha);
  return [...files(oldBase, newBase)].filter(f => !differsFromOldBase.has(f)).sort();
}

export function main(input: string): number {
  try {
    const suspects = parseBranchPushes(input).flatMap(push =>
      findSuspectFiles(push).map(file => ({ ref: push.localRef, file }))
    );
    if (suspects.length === 0) return 0;
    const lines = suspects.map(s => `  ${s.ref}  ${s.file}`).join('\n');
    if (process.env[OVERRIDE_ENV] === '1') {
      process.stderr.write(
        `!!! ${OVERRIDE_ENV}=1: pushing a rewrite that reverts newer origin/main changes to ${suspects.length} file(s):\n${lines}\n`
      );
      return 0;
    }
    process.stderr.write(
      `PUSH BLOCKED: this rewrite puts ${suspects.length} file(s) back to how they were before ` +
        `origin/main's newer changes. It reverts main's newer work ` +
        `(squashed against a moved origin/main?):\n${lines}\n` +
        `Fix: find the original tip in the reflog (git reflog <branch>), then rebuild the commit from ` +
        `the merge-base: git reset --soft "$(git merge-base HEAD origin/main)" && git commit, then ` +
        `git merge origin/main or rebase. Override once: ${OVERRIDE_ENV}=1 git push ...\n`
    );
    return 1;
  } catch (error) {
    process.stderr.write(
      `PUSH BLOCKED: could not inspect whether the rewrite reverts origin/main: ${String(error)}. Nothing was pushed.\n`
    );
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(readFileSync(0, 'utf8'));
}
