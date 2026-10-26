/**
 * Whether a merge commit added anything of its own (MYK9-1398; Codex review of
 * #3284). `git merge-tree --write-tree` recomputes the automatic merge of the
 * two parents; if that tree is exactly the commit's tree, the merge is a pure
 * integration and resolveAuthorship may skip it. A conflict resolution or a
 * change slipped into a conflict-free merge both make the trees differ.
 *
 * Fail closed: an ordinary commit, an octopus merge, a conflicting automatic
 * merge, an unknown commit or any git error is "not clean", so the commit
 * must carry a matching harness trailer instead. Needs both parents fetched.
 */
import { execFileSync } from 'node:child_process';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export function isCleanMerge(sha: string, cwd: string): boolean {
  try {
    const [, ...parents] = git(['rev-list', '--parents', '-n', '1', sha], cwd).split(' ');
    if (parents.length !== 2) return false;
    // Exits 1 on conflicts, which throws and lands in the catch.
    const merged = git(['merge-tree', '--write-tree', parents[0]!, parents[1]!], cwd);
    return merged === git(['rev-parse', `${sha}^{tree}`], cwd);
  } catch {
    return false;
  }
}
