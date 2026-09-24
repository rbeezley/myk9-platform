---
name: cleanup
description: Use when finishing a work session, after committing, or when asked to "clean up", "check for loose ends", "anything left to do". Checks for stale worktrees, uncommitted changes, unpushed migrations, stale todos, and other post-work hygiene.
---

# Session Cleanup

Run all checks, report findings, and fix what can be auto-fixed. Ask before destructive actions.

This file is shared by Claude Code and Codex (`.agents/skills/cleanup` is a symlink to it).

## Checks

Run all checks in parallel where possible.

### 1. Stale Git Worktrees

```bash
git worktree list
```

- Worktrees under `.claude/worktrees/` (Claude Code) and `.codex/worktrees/` (Codex) are agent leftovers.
- A worktree is _stale_ if its branch has been merged into `main` OR its remote tracking branch is gone (`git rev-parse --abbrev-ref <branch>@{u}` fails or prints "(gone)"). The remote-branch-gone signal is reliable because the repo auto-deletes branches on PR merge.
- **Squash-merge detection:** `git log` comparisons will show a squash-merged branch as "unmerged" because the SHA is rewritten. Before flagging any branch as having unpushed work, run BOTH checks:
  ```bash
  gh pr list --state merged --head <branch>
  gh pr list --state merged | grep -F "$(git log <branch> --not main --oneline | head -1 | cut -d' ' -f2-)"
  ```
  Only flag as truly unpushed if both checks return empty.
- **Self-unmount case:** if cwd is inside a stale worktree, **do not run the removal yet** — removing the directory breaks the harness's CWD tracking and blocks all subsequent Bash calls. Collect all stale worktrees to remove, then execute the removal as the very **last** Bash call of the entire cleanup run, after all other checks are complete. Chain everything into one command so no further calls are needed after the directory disappears:
  ```bash
  MAIN="/absolute/path/to/main/repo"
  WT="/absolute/path/to/stale-worktree"
  # worktree remove is the last command; never --force (see "Removal" below)
  pnpm -s qa:worktree-liveness "$WT" --window 5 && git -C "$MAIN" worktree remove "$WT"
  ```
  Leave the local branch: `git branch -D` is a denied command in this repo's Claude Code permissions (Codex may run it per `AGENTS.md`, before the worktree removal). The harness recovers the session CWD to the main repo after the call. The user's terminal CWD will be stale — note that in the report.
- **Always ask before removing any worktree** — another agent may be actively using it even if the branch looks merged or clean. List all stale candidates and ask the user to confirm which (if any) to remove. Never auto-remove.
- **Liveness comes from processes, never from a session's `isRunning` or `lastActivityAt`** (MYK9-599). On 2026-09-15 one session read `isRunning: true` from `list_sessions` and `false` from `get_session` a minute later, with nothing changed. Another read `true` while its worktree no longer existed. `lastActivityAt` advanced in lockstep across idle sessions, so it is a heartbeat, not activity. Neither field has a documented narrower meaning, so do not use either one for any decision. A false `true` blocks cleanup forever, and a false `false` removes a live agent's tree. For each candidate, run:
  ```bash
  pnpm -s qa:worktree-liveness "<absolute worktree path>"   # --window 15 --threshold 10 are the defaults
  ```
  The verdict is **advisory evidence only**. The check sees only processes whose cwd is inside the tree. A process running from another directory that holds a file in the tree open for writing is invisible to it, so FREE does not mean nothing is writing there (follow-up: "worktree-liveness: detect write handles from processes outside the tree"). It finds processes whose cwd is inside the tree (`lsof -d cwd`) and every descendant (from the `ps` parent-pid table, as `pgrep -P` would find them). It samples their CPU twice, 15s apart, with `ps -o time=`, and lists files under the tree they hold open for writing (`lsof -p`). The verdict is **FREE** (exit 0) when nothing holds the tree. It is **BUSY** (exit 1) at 10% of one core or more, or with any write handle. It is **QUIET** (exit 3) when the tree is held below that with no writes; exit 2 means the check could not run, and it fails closed: a `ps` or `lsof` that errors or returns a partial table is exit 2, never FREE. 10% separates polling from work: the idle session measured on 2026-09-15 accrued 0.69s over 15s (4.6%), which is MCP polling. Report a BUSY tree and do not offer to remove it. QUIET is not proof of abandonment, because a session waiting on a model reply is quiet too. It is the precondition for _asking_, together with a clean tree and a branch tip whose SHA equals the merged PR's `headRefOid`, never a branch-name match.
- **Stopping a holder, after the user confirms.** Stop the session through the harness when it offers a stop, otherwise `kill <pid>` (SIGTERM) on the holder and on the children the check listed. Use `kill -9` only when a process is still alive after that and the user agrees. Then re-run `qa:worktree-liveness` and remove the tree only on **FREE** (exit 0), chained in one command so the gap between the check and the removal is as short as it can be:
  ```bash
  pnpm -s qa:worktree-liveness "$WT" --window 5 && git -C "$MAIN" worktree remove "$WT"
  ```
- **Removal is plain `git worktree remove`, never `--force`.** FREE is advisory, so git's own refusal is the backstop: it declines a tree with modified or untracked files. If git refuses, stop and report the files it names. Do not force, and do not clean the tree to get past it.
- **Reap dev servers first.** Before removing a worktree, run §2 scoped to that worktree path and kill any survivors — otherwise they keep listening on their ports as zombies after the directory is gone.
- Report how many were found; only remove after explicit user confirmation.

### 2. Orphan Dev Servers

Dev servers spawned from a worktree don't get killed when `git worktree remove` runs — they keep their sockets bound with no live files behind them. Symptom: a dev server URL that returns 404 for every path (including `/@vite/client`), or "port already in use" when you start a fresh server. They also confuse `localhost` resolution: an IPv4-bound zombie and an IPv6-bound fresh Vite can both claim the same port, and the browser silently routes to whichever family the OS prefers.

Scan for `node`/`vite`/`next`/`tsx`/`nodemon` processes whose `cwd` lives under `.claude/worktrees/` or `.codex/worktrees/`:

```bash
for pid in $(pgrep -f 'vite|next|webpack|tsx|nodemon' 2>/dev/null); do
  cwd=$(lsof -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/{print substr($0,2)}' | head -1)
  case "$cwd" in
    *"/.claude/worktrees/"*|*"/.codex/worktrees/"*) echo "$pid	$cwd";;
  esac
done
```

For each match, extract the worktree name (the segment after `.claude/worktrees/` or `.codex/worktrees/`) and check whether it still appears in `git worktree list`. If it doesn't, the process is orphaned. Confirm the port it's holding before reporting:

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

- If `--dry-run` is not supported, check the last commit that touched `supabase/migrations/` and compare with the deploy note in the relevant Linear issue (team **MyK9-platform**) or plan document
- If unapplied migrations exist, report them and ask if user wants to push now
- If user confirms, invoke the `/db-push` skill

### 6. Linear Sync

Verify that any Linear issues (team **MyK9-platform**) you closed or finished this session are actually moved to Done. Reconcile against Linear — issues completed in work but still Open, or issues moved to Done whose work did not land.

Also scan for staleness:

- Issues still Open whose referenced PRs or files already exist (done but not updated)
- Done issues that reference "Deploy: `supabase db push`" -- cross-check with migration push status

### 7. Stale Branches

```bash
git branch --merged main | grep -v '^\*\|main' | head -10
```

- Report branches already merged into main. `git branch -D` is denied for Claude Code and `-d` refuses squash-merged history, so Claude Code only reports; the weekly branch-janitor reaps merged remotes. Codex may delete after the user confirms, per `AGENTS.md`.

### 8. Edge Function Deploys

**Verify actual deploy state — do not just diff recent commits.** Merging a PR never deploys functions (see the `feedback_merge_is_not_deploy` memory). A `git diff HEAD~N` window misses functions committed long ago but never deployed, and a root-only path glob misses the second function location entirely. Compare each function's source last-commit date against its _deployed_ `UPDATED_AT`.

**Functions live in TWO directories** — check both:

- `supabase/functions/` (root) — e.g. `send-email`, `validate-passcode`, `push-trigger-*`, `admin-*`
- `apps/myk9show/supabase/functions/` (Stripe/cron) — e.g. `stripe-*`, `cron-*`

Run the check (read-only; it never deploys). It lists both dirs, excludes `_shared`, reads the deployed list with `supabase functions list -o json`, and prints one status per function:

```bash
pnpm -s qa:edge-function-drift            # dates only, seconds
pnpm -s qa:edge-function-drift --content  # downloads each deploy and compares it with source, minutes
```

Exit 0 means every function is current; exit 1 means at least one row below needs a decision; exit 2 means the check could not run, including a `--content` download that failed (`check-failed` rows). Report the non-`current` rows.

- **`stale`:** the source changed after the deploy. With `--content` this is proof: the note names the files whose deployed copy differs from source after both are Prettier-formatted, including `_shared` files.
- **`unknown`:** dates cannot decide. This clone is **shallow** (`git rev-parse --is-shallow-repository`), and `git log -- <dir>` for a file untouched since the graft boundary returns the BOUNDARY's date, not the real edit date. The real edit is at or before the boundary, so a deploy newer than the boundary is reported `current`; a deploy older than it is `unknown`, never `stale`. On 2026-09-15 the hand-run version of this check called 20 of 45 functions stale for this reason alone (MYK9-597). Settle an `unknown` with `--content`, which compares what is deployed with source. `git fetch --unshallow` also makes the dates meaningful, but it is a large fetch: offer it, and do not run it unprompted.
- **`sub-day`:** a squash-merge stamps its commit time at _merge_, which can land minutes _after_ a deploy that ran from the feature branch. Treat it as ordering noise unless `--content` says `stale`.
- **`never-deployed`:** a source function with no deployed slug.
- **`orphan-deploy`:** a deployed slug with no source dir in either function dir. It is live code that nothing in the repo maintains. Ask whether to restore its source or delete the deploy; deleting is a shared-system write.
- **`dual-location`:** the _same_ function name appears in BOTH source dirs. Only one is the deployed slug, so do NOT guess. Determine canonical by which copy handles a type/route the app actually invokes (e.g. `send-email`'s `entry_decision` case → root is canonical; the `apps/myk9show` copy was a drift-magnet fork, deleted in PR #937). Editing or deploying the wrong copy ships nothing.

Calibration, for a date-mode flag you confirm by hand:

- **A date is not a behavioural change.** Dates come from the function's own dir, so a sibling test or a comment moves them and a `_shared` edit does not. Commits listed in `.git-blame-ignore-revs` (the one-time Prettier pass, #2121) are skipped. `--content` is the confirmation. Prefer it over reading a diff.
- **An all-insertions diff is a moved path or a history floor, not a change.** `git show <last-commit> -- <dir>/index.ts` on a graft-boundary commit or a rename shows the whole file as added (e.g. `index.ts | 273 +++`), which looks like a large edit. It says nothing about behaviour. Compare content instead.

- For each stale/never-deployed function, report it and include the deploy command. Root functions deploy from the repo root; Stripe/cron functions need `--workdir apps/myk9show`:
  ```bash
  # root function
  supabase functions deploy <name> --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
  # apps/myk9show function
  supabase functions deploy <name> --workdir apps/myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
  ```
- **Deploying is a shared-system write — always ask before running it** (never auto-deploy). Editing a `_shared/*` helper restales every function that imports it; redeploy those importers, not just directly-changed function dirs.

## Output Format

```
Session Cleanup Report
======================

Worktrees:     2 stale worktrees cleaned up
Dev servers:   1 orphan killed (PID 83484, was bound to :5173 from removed worktree zealous-carson-15859a)
Git:           Working tree clean, all pushed
Migrations:    dry-run clean — remote up to date
Linear:        3 issues moved to Done, all consistent
Branches:      1 merged branch deleted (worktree-agent-abc123)
Edge Functions: deploy state verified — all current

All clean.
```

If issues need user input, list them at the end:

```
Action needed:
  1. 2 uncommitted files -- commit or discard?
  2. Migration 110 not yet pushed -- push now?
  3. send-email source (06-23) newer than deployed (05-03) -- deploy now?
```

## Rules

- Run all checks even if early ones find issues
- NEVER auto-remove worktrees — always ask first (another agent may be using it). Judge "in use" with `qa:worktree-liveness`, never with a session's `isRunning` or `lastActivityAt`. A fresh FREE is required but advisory: remove with plain `git worktree remove`, never `--force`, and stop if git refuses.
- NEVER auto-kill dev servers whose worktree still exists — ask first (another agent may be using it). Auto-killing IS allowed when both the worktree directory is gone AND its name is absent from `git worktree list`.
- **Reap dev servers before removing their worktree** — `git worktree remove` does not kill child processes, so dev servers outlive their source tree and become 404-serving zombies
- Always ask before: committing, pushing, deploying, deleting unmerged branches
- **Verify deploy state, don't infer it from git** — for migrations and edge functions, the authoritative signal is the remote (`db push --dry-run`, `functions list` UPDATED_AT), not a commit diff. A merged PR is not a deployed PR.
- **Worktree removal goes last** — if the current session CWD is a stale worktree, defer its removal to the final Bash call after all other checks are done
- Be concise -- one line per check in the report unless action is needed
