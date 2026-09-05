# Git Workflow Reference — Worktrees, Merges, Branch Hygiene

Full mechanics behind the hard rules in [`CLAUDE.md`](../../CLAUDE.md) § "Worktree & Merge Workflow." See [`docs/PLAYBOOK.md`](../PLAYBOOK.md) § 8 for the short version in context.

## Why worktrees are required

Work in a worktree, never the primary checkout, whenever concurrent agents may be active. This is enforced: `.githooks/pre-commit` blocks a commit from the primary working tree while any linked worktree exists (the classic `git add -A` sweep that clobbers a co-resident agent's WIP). `scripts/bootstrap-worktree.sh` activates the hook by pointing `core.hooksPath` at `.githooks` (it handles this repo's `extensions.worktreeConfig`, where a per-worktree override would otherwise shadow a plain `core.hooksPath` set — see `.githooks/README.md`). The hook is invisible to compliant worktree commits and to solo work with no worktrees. Bypass once for the docs-only-direct-to-`main` flow with `MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...`.

## Merging

- ALWAYS run `gh pr merge` from the main repo directory, NEVER from inside a feature worktree (causes stale worktree + cwd lockup).
- Before reporting a branch as having unpushed work, run `gh pr list --state merged --head <branch>` AND grep merged PR titles for the branch's commit messages. Only flag as truly unpushed if both checks return empty.

## Post-merge branch hygiene

Immediately after a PR merge, while the branch name is still known:

1. Switch to the main repo directory and sync `main`: `git checkout main && git pull --ff-only`.
2. `git fetch --prune` to drop remote-tracking refs for auto-deleted PR branches.
3. Merge with `gh pr merge --squash` and **no `--delete-branch`**: its local half silently fails while any worktree (including the merging session's own) holds the branch, and the weekly branch-janitor reaps merged remotes.
4. Remove the worktree (`git worktree remove <path> --force`) and **leave the local branch**. `git branch -D` is a denied command for Claude Code in this repo and `-d` refuses squash-merged history; branch-janitor reports merged locals. Codex may delete the branch after the worktree is gone, per `AGENTS.md`.
5. Do worktree removal as the FINAL command of the cleanup sequence if the current shell is inside that worktree — don't run further commands from a path that no longer exists.

Branches named `pr-###`, scratch branches, or temporary review branches should be deleted immediately after the corresponding PR/review work is merged or abandoned — don't leave them for weekly cleanup unless explicitly marked active.

## Gotchas

- **Worktree-before-branch-delete:** `git branch -D <branch>` fails with "cannot delete branch ... used by worktree" if any worktree — including the one you're running from — is checked out on that branch. Remove the worktree first. Observed 2026-07-13 when `gh pr merge --delete-branch` merged PR #1315, deleted the remote branch, but silently failed the local delete because the merging session's own worktree still held it.
- **Bash matcher caveat:** Permission rules like `Bash(git branch:*)` gate on the literal start of the command. A compound `cd "..." && git branch -D ...` does NOT match — the rule sees `cd`, not `git branch`. The harness already persists working directory between bash calls, so drop the `cd` prefix entirely and invoke `git branch -D ...` directly. Observed 2026-05-24 during stale-branch cleanup — three denials in a row before the pattern surfaced.
- **Before directing destructive history rewrites** (`git reset --hard`, interactive rebase drops, force-push that rewrites branch tip), check whether the agent has uncommitted edits in the working tree. Those edits travel across `git checkout` and get wiped by `reset --hard`. Commit or stash them first.

## Docs-only direct-to-`main` — full scope

**In scope:**

- `docs/**/*.md` (including `docs/plans/`, `docs/superpowers/`, `docs/ux-audits/`, etc.)
- `apps/*/docs/**/*.md`
- Top-level tracking/reference docs: `OPEN-TODOS.md`, `TO-DOS.md`, `README.md`, `CONTEXT.md`, `DESIGN.md`, `PRODUCT.md`, `TECHNICAL_DEBT.md`, `DEFERRED-WORK.md`, `INTENT.md` (additions/clarifications only — substantive intent changes still PR)
- `packages/*/README.md`, `supabase/functions/*/README.md` (reference docs, not deployment configs)

**Out of scope — still requires a PR:**

- `CLAUDE.md`, `AGENTS.md` (load-bearing project instructions)
- `.claude/**`, `.github/**` (settings, hooks, workflows)
- Any commit that _also_ touches non-doc files — mixed commits go through PR
- Deletions or rewrites of plans authored by others, even if the file is in scope

Verify the commit's filelist matches the scope before pushing. If anything outside the in-scope list is staged, open a PR instead.

As of 2026-06-14 the `main` rulesets grant the admin role (the owner token) `bypass_mode: always`, so a direct push genuinely succeeds — the PR and required-checks gates are bypassed for that identity. The bypass is actor-based, not path-scoped, so this scope restriction is enforced by convention, not by GitHub.
