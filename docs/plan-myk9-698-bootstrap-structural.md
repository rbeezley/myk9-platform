# MYK9-698 worktree bootstrap hardening

## Scope

Preserve complete, NUL-safe worktree inventory parsing while preventing simultaneous bootstrap runs from failing on shared Git config writes. Reject non-absolute checkout paths before changing Git configuration or copying local setup files.

## Implementation

1. Carry forward the focused inventory regression coverage and prove it against the current implementation.
2. Remove unnecessary common-config writes when per-worktree config is enabled; serialize any unavoidable shared config update so old repositories cannot race.
3. Validate the selected current and primary worktree paths as absolute before setup mutations; add regressions for relative paths, explicit lock contention/recovery, concurrent invocations, and repository-local config selection.
4. Run the focused test, shell syntax check, a real disposable-worktree bootstrap, and the code-quality ratchet.

## Testing

- `pnpm vitest run scripts/bootstrap-worktree.test.ts`
- Regression coverage for large NUL-delimited inventories, inventory errors, malformed/relative paths, lock contention/recovery, simultaneous bootstraps, and global-versus-repository config selection.
- `bash -n scripts/bootstrap-worktree.sh`
- Real `bash scripts/bootstrap-worktree.sh` from a disposable linked worktree; verify hooks, dependency readiness, and fresh package outputs.
- `pnpm qa:code-quality-ratchet`
