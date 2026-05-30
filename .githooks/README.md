# .githooks/

Tracked git hooks for the myK9 Platform monorepo. These are version-controlled
(unlike the untracked `.git/hooks/`) so the enforcement travels with the repo.
See the activation note below — `extensions.worktreeConfig` requires more than a
single `core.hooksPath` set.

## Activation

`core.hooksPath` must point at this directory. `scripts/bootstrap-worktree.sh`
sets it automatically (it runs after `EnterWorktree` and can be run manually).

**This repo enables `extensions.worktreeConfig`**, and the Claude Code worktree
harness seeds a *per-worktree* `core.hooksPath` (in each checkout's
`config.worktree`, pointed at `.git/hooks`) that **overrides** the shared value.
So a plain `git config core.hooksPath .githooks` is **not enough** — the
per-worktree override shadows it. The guard only ever *blocks* from the
**primary** checkout (it's a no-op in linked worktrees), so the primary's
override is the one that must be repointed. `bootstrap-worktree.sh` handles all
of this; to do it by hand:

```bash
# shared value (covers fresh clones with no worktrees)
git config --file "$(git rev-parse --git-common-dir)/config" core.hooksPath .githooks
# repoint the per-worktree override in THIS checkout and the primary one
git config --file "$(git rev-parse --git-dir)/config.worktree" core.hooksPath .githooks
git config --file /path/to/main/.git/config.worktree core.hooksPath .githooks
```

Verify with `git config --get core.hooksPath` (should print `.githooks`).

> **Existing worktrees** created before this landed keep their stale override
> until `bootstrap-worktree.sh` runs in them again — but since the guard is a
> no-op in linked worktrees anyway, only the **primary** checkout's override
> matters for enforcement, and bootstrap repoints that from any worktree run.

## Hooks

### `pre-commit` — concurrent-agent worktree guard

Blocks a commit **only** when both are true:

1. the commit is happening in the **primary** working tree, and
2. at least one **linked worktree** currently exists.

This targets the repo's recurring collision: multiple concurrent agents
(Codex + Claude sessions) sharing the primary checkout, where one actor's
`git add -A` sweeps another's untracked work-in-progress. Committing from a
worktree (the compliant path) never trips it; solo work with no worktrees
never trips it.

Bypass once (e.g. the documented docs-only-direct-to-`main` flow):

```bash
MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...
```

See `CLAUDE.md` → "Worktree & Merge Workflow" and `AGENTS.md` → "Critical
rules" for the full convention.
