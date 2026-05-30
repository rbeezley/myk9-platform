# .githooks/

Tracked git hooks for the myK9 Platform monorepo. These are version-controlled
so every clone and every worktree gets the same enforcement (unlike the
untracked `.git/hooks/`).

## Activation

`core.hooksPath` must point at this directory. `scripts/bootstrap-worktree.sh`
sets it automatically (it runs after `EnterWorktree` and can be run manually).
To activate by hand in any checkout:

```bash
git config core.hooksPath .githooks
```

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
