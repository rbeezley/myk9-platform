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
- **Squash-merge detection:** `git log` comparisons will show a squash-merged branch as "unmerged" because the SHA is rewritten. Before flagging any branch as having unpushed work, run BOTH checks:
  ```bash
  gh pr list --state merged --head <branch>
  gh pr list --state merged | grep -F "$(git log <branch> --not main --oneline | head -1 | cut -d' ' -f2-)"
  ```
  Only flag as truly unpushed if both checks return empty.
- **Self-unmount case:** if cwd is inside a stale worktree, **do not run the removal yet** — removing the directory breaks Claude Code's CWD tracking and blocks all subsequent Bash calls. Collect all stale worktrees to remove, then execute the removal as the very **last** Bash call of the entire cleanup run, after all other checks are complete. Chain everything into one command so no further calls are needed after the directory disappears:
  ```bash
  MAIN="/absolute/path/to/main/repo"
  # Delete the branch BEFORE removing the worktree — worktree remove is the last command
  git -C "$MAIN" branch -D <stale-branch> \
    && git -C "$MAIN" worktree remove --force "/absolute/path/to/stale-worktree"
  ```
  Claude Code will automatically recover the session CWD to the main repo after the call. The user's terminal CWD will be stale — note that in the report.
- **Always ask before removing any worktree** — another agent may be actively using it even if the branch looks merged or clean. List all stale candidates and ask the user to confirm which (if any) to remove. Never auto-remove.
- **Reap dev servers first.** Before removing a worktree, run §2 scoped to that worktree path and kill any survivors — otherwise they keep listening on their ports as zombies after the directory is gone.
- Report how many were found; only remove after explicit user confirmation.

### 2. Orphan Dev Servers

Dev servers spawned from a worktree don't get killed when `git worktree remove` runs — they keep their sockets bound with no live files behind them. Symptom: a dev server URL that returns 404 for every path (including `/@vite/client`), or "port already in use" when you start a fresh server. They also confuse `localhost` resolution: an IPv4-bound zombie and an IPv6-bound fresh Vite can both claim the same port, and the browser silently routes to whichever family the OS prefers.

Scan for `node`/`vite`/`next`/`tsx`/`nodemon` processes whose `cwd` lives under `.claude/worktrees/`:

```bash
for pid in $(pgrep -f 'vite|next|webpack|tsx|nodemon' 2>/dev/null); do
  cwd=$(lsof -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/{print substr($0,2)}' | head -1)
  case "$cwd" in
    *"/.claude/worktrees/"*) echo "$pid	$cwd";;
  esac
done
```

For each match, extract the worktree name (the segment after `.claude/worktrees/`) and check whether it still appears in `git worktree list`. If it doesn't, the process is orphaned. Confirm the port it's holding before reporting:

```bash
lsof -nP -p <pid> -iTCP -sTCP:LISTEN
```

- **Always ask before `kill <pid>`** — the process may belong to another live agent session, especially if the worktree path still appears under `git worktree list`. Only auto-kill candidates whose worktree directory is gone AND not in `git worktree list`.
- Prefer `kill` (SIGTERM) over `kill -9`. Vite writes its shutdown line and flushes `node_modules/.vite` on SIGTERM; a SIGKILL can leave the dep cache half-written and wedge the next start.
- **Diagnostic shortcut:** if a Vite URL returns 404 for `/@vite/client` (a built-in endpoint that always exists when Vite is alive), you're not talking to Vite — you're talking to a zombie. That single probe collapses the diagnostic tree before you start digging into config.

### 3. Uncommitted Changes

```bash
git status
git diff --stat
```

- If there are unstaged or staged changes, report what files are dirty
- Do NOT auto-commit -- ask the user what to do

### 4. Unpushed Commits

```bash
git log @{u}..HEAD --oneline 2>/dev/null
```

- If there are local commits not on the remote, warn the user
- Do NOT auto-push -- ask the user

### 5. Unpushed Database Migrations

```bash
# Find local migrations
ls supabase/migrations/ | tail -5

# Check which are applied remotely (requires project to be linked)
source supabase/.env 2>/dev/null && supabase db push --password "$SUPABASE_DB_PASSWORD" --dry-run 2>&1
```

- If `--dry-run` is not supported, check the last commit that touched `supabase/migrations/` and compare with the deploy note in TO-DOS.md
- If unapplied migrations exist, report them and ask if user wants to push now
- If user confirms, invoke the `/db-push` skill

### 6. TO-DOS.md Sync

```bash
# Check for items marked done in this session's commit
git diff HEAD~1 -- TO-DOS.md | grep '^\+.*\[x\]' | head -10
git diff HEAD~1 -- TO-DOS.md | grep '^\-.*\[ \]' | head -10
```

Also scan for staleness:

- Items still marked `[ ]` whose referenced PRs or files already exist (done but not updated)
- Items marked `[x]` that reference "Deploy: `supabase db push`" -- cross-check with migration push status

### 7. Stale Branches

```bash
git branch --merged main | grep -v '^\*\|main' | head -10
```

- Report branches already merged into main that can be deleted
- Ask user before deleting: `git branch -d <branch>`

### 8. Edge Function Deploys

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
Dev servers:   1 orphan killed (PID 83484, was bound to :5173 from removed worktree zealous-carson-15859a)
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
- NEVER auto-remove worktrees — always ask first (another agent may be using it)
- NEVER auto-kill dev servers whose worktree still exists — ask first (another agent may be using it). Auto-killing IS allowed when both the worktree directory is gone AND its name is absent from `git worktree list`.
- **Reap dev servers before removing their worktree** — `git worktree remove` does not kill child processes, so dev servers outlive their source tree and become 404-serving zombies
- Always ask before: committing, pushing, deploying, deleting unmerged branches
- **Worktree removal goes last** — if the current session CWD is a stale worktree, defer its removal to the final Bash call after all other checks are done
- Be concise -- one line per check in the report unless action is needed
