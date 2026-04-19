---
name: cleanup
description: Use when finishing a work session, after committing, or when asked to "clean up", "check for loose ends", "anything left to do". Checks for stale worktrees, uncommitted changes, unpushed migrations, stale todos, and other post-work hygiene.
---

# Session Cleanup

Run all checks, report findings, and fix what can be auto-fixed. Ask before destructive actions.

## Checks

Run all checks in parallel where possible.

### 1. Stale Git Worktrees

```bash
git worktree list
```

- Worktrees under `.claude/worktrees/` are agent leftovers.
- A worktree is _stale_ if its branch has been merged into `main` OR its remote tracking branch is gone (`git rev-parse --abbrev-ref <branch>@{u}` fails or prints "(gone)"). The remote-branch-gone signal is reliable because the repo auto-deletes branches on PR merge.
- **Self-unmount case:** if cwd is inside a stale worktree, you can't `git worktree remove` from within it. Resolve by `cd`-ing to the main worktree first:
  ```bash
  MAIN=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
  cd "$MAIN"
  git worktree remove --force <stale-path>
  git branch -D <stale-branch>
  ```
  After this, the shell's original cwd no longer exists — report that to the user so they know to `cd` somewhere valid.
- **Auto-fix** (safe when the branch is merged or upstream is gone): remove the worktree and delete the orphan branch. If the branch has unpushed work or isn't merged, ask first.
- Report how many were cleaned.

### 2. Uncommitted Changes

```bash
git status
git diff --stat
```

- If there are unstaged or staged changes, report what files are dirty
- Do NOT auto-commit -- ask the user what to do

### 3. Unpushed Commits

```bash
git log @{u}..HEAD --oneline 2>/dev/null
```

- If there are local commits not on the remote, warn the user
- Do NOT auto-push -- ask the user

### 4. Unpushed Database Migrations

```bash
# Find local migrations
ls supabase/migrations/ | tail -5

# Check which are applied remotely (requires project to be linked)
source supabase/.env 2>/dev/null && supabase db push --password "$SUPABASE_DB_PASSWORD" --dry-run 2>&1
```

- If `--dry-run` is not supported, check the last commit that touched `supabase/migrations/` and compare with the deploy note in TO-DOS.md
- If unapplied migrations exist, report them and ask if user wants to push now
- If user confirms, invoke the `/db-push` skill

### 5. TO-DOS.md Sync

```bash
# Check for items marked done in this session's commit
git diff HEAD~1 -- TO-DOS.md | grep '^\+.*\[x\]' | head -10
git diff HEAD~1 -- TO-DOS.md | grep '^\-.*\[ \]' | head -10
```

Also scan for staleness:

- Items still marked `[ ]` whose referenced PRs or files already exist (done but not updated)
- Items marked `[x]` that reference "Deploy: `supabase db push`" -- cross-check with migration push status

### 6. Stale Branches

```bash
git branch --merged main | grep -v '^\*\|main' | head -10
```

- Report branches already merged into main that can be deleted
- **Auto-fix with confirmation:** `git branch -d <branch>`

### 7. Edge Function Deploys

Check if any edge functions were modified but not deployed:

```bash
git diff HEAD~3 --name-only -- supabase/functions/ 2>/dev/null
```

- If edge function files changed in recent commits, remind user to deploy them
- Include the deploy command: `supabase functions deploy <function-name> --no-verify-jwt`

## Output Format

```
Session Cleanup Report
======================

Worktrees:     2 stale worktrees cleaned up
Git:           Working tree clean, all pushed
Migrations:    109_restrict_subscription_columns.sql already applied
TO-DOS:        3 items marked done, all consistent
Branches:      1 merged branch deleted (worktree-agent-abc123)
Edge Functions: No changes detected

All clean.
```

If issues need user input, list them at the end:

```
Action needed:
  1. 2 uncommitted files -- commit or discard?
  2. Migration 110 not yet pushed -- push now?
```

## Rules

- Run all checks even if early ones find issues
- Auto-fix only safe operations (stale worktrees, merged branches)
- Always ask before: committing, pushing, deploying, deleting unmerged branches
- Be concise -- one line per check in the report unless action is needed
