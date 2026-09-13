# .githooks/

Tracked git hooks for the myK9 Platform monorepo. These are version-controlled
(unlike the untracked `.git/hooks/`) so the enforcement travels with the repo.
See the activation note below — `extensions.worktreeConfig` requires more than a
single `core.hooksPath` set.

## Activation

`core.hooksPath` must point at this directory. `scripts/bootstrap-worktree.sh`
sets it automatically (it runs after `EnterWorktree` and can be run manually).

**This repo enables `extensions.worktreeConfig`**, and the Claude Code worktree
harness seeds a _per-worktree_ `core.hooksPath` (in each checkout's
`config.worktree`, pointed at `.git/hooks`) that **overrides** the shared value.
So a plain `git config core.hooksPath .githooks` is **not enough** — the
per-worktree override shadows it. The `pre-push` guard runs from **every**
checkout, including linked worktrees, so each checkout's effective setting
must point at a directory containing the hook. `bootstrap-worktree.sh` handles
the current and primary checkouts; to do it by hand:

```bash
# shared value (covers fresh clones with no worktrees)
git config --file "$(git rev-parse --git-common-dir)/config" core.hooksPath .githooks
# repoint the per-worktree override in THIS checkout and the primary one
git config --file "$(git rev-parse --git-dir)/config.worktree" core.hooksPath .githooks
git config --file /path/to/main/.git/config.worktree core.hooksPath .githooks
```

Verify with `git config --get core.hooksPath` (should print `.githooks`).

> **Existing worktrees** created before this landed may keep a stale override
> until `bootstrap-worktree.sh` runs in each of them. Verify the effective
> `core.hooksPath` and installed `pre-push` in every active checkout.

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

### `pre-push` — repository-wide operator hold

Before updating any remote ref, the hook reads repository issue comments newest
first and accepts directives only on PRs, including **closed PRs**.
A first-line `PUSH HOLD: <reason>` comment from a repository OWNER, MEMBER, or
COLLABORATOR blocks every push, including a new branch's first push. The newest
trusted hold or release across PRs wins by comment creation time, then comment
ID for same-second ties (including a page boundary); editing an older comment
does not reorder it. The historical first-line wording
`Hold all pushes until further notice — <reason>` is also recognized. Quoted
examples and comments from other authors do not count. The refusal prints the
reason and pushed refs and exits nonzero. If GitHub cannot be queried, the hook
also refuses the push because it cannot establish that there is no hold.

To release a hold, post **one** first-line `PUSH RELEASE` comment from a trusted
account on any PR. Closing the hold or release PR does not change the result.
The scan stops at the newest trusted directive; if it finds none in the newest
2,000 comments, it refuses the push until an owner or member posts a fresh
`PUSH RELEASE` checkpoint. This bounds API calls without silently discarding
an older hold. This is a push guard, not a substitute for GitHub branch
permissions: someone who disables local hooks can bypass it.

The tracked hook activates in a checkout only after that checkout receives the
commit containing it. Existing long-lived worktrees on older branches stay
unguarded until updated; verify their hook files and `core.hooksPath` before
claiming the hold protects every active agent loop.
