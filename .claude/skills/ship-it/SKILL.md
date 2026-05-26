---
name: ship-it
description: Use when given a plan document path to autonomously implement, test, review, and merge a feature end-to-end with no human input until final merge confirmation.
---

# Ship It — Autonomous PR Pipeline

Takes a plan path and ships it end-to-end: implement → test loop → commit → PR → self-review loop → merge → cleanup.

**Usage:** `/ship-it <path-to-plan.md>`

**Main repo path (hardcoded):** `/Users/richardbeezley/AI Projects/myk9-platform`

---

## Step 0: Load Plan and Establish Context

```bash
MAIN="/Users/richardbeezley/AI Projects/myk9-platform"
BRANCH=$(git branch --show-current)
WORKTREE=$(git rev-parse --show-toplevel)
```

Read the plan file in full. Create a TodoWrite with one item per plan task — mark each `pending`. Do not start implementing until todos are created.

---

## Step 1: Worktree Check

```bash
git worktree list | grep "$WORKTREE"
```

If not inside a worktree under `.claude/worktrees/`, invoke `superpowers:using-git-worktrees` to create one before proceeding. Never implement on `main`.

---

## Step 2: Implement Per Plan

Work through todos in order. For each task:
- Mark `in_progress`
- Read affected files before editing
- Make only the changes the task requires — no scope creep
- After every batch of TypeScript edits, run `pnpm typecheck` and fix errors before moving to the next file
- Mark `completed`

---

## Step 3: Test Loop (until green)

```bash
pnpm typecheck && pnpm lint
```

Then run tests scoped to changed files (same logic as `/commit` skill: full suite if >3 source files changed, related tests only if ≤3).

Fix failures. Repeat until all pass. **Max 10 iterations** — stop and report if still failing.

**CI note:** GHA billing is paused on this project — do not wait for CI checks.

---

## Step 3a: SQL Compile-Check (conditional)

If the diff contains any `.sql` files under `supabase/migrations/`, compile-check them against a real Postgres instance BEFORE the JS-focused passes run. `pnpm typecheck` does not parse SQL, and the harden agent in Step 3c reads files but does not execute them — both blind spots that have shipped `db push`-failing migrations to PR review.

The most common failures this catches:
- **`%ROWTYPE` against a function** — only resolves against relations/composites; functions that `RETURNS TABLE (...)` produce anonymous result rows, not registered types. Use `record` instead.
- **Function/column references to objects that don't exist yet** in the migration sequence
- **Missing `;` terminators, malformed DO blocks, plpgsql syntax errors**
- **GRANT/REVOKE on functions whose signature doesn't match the new definition** (PostgreSQL silently keeps the old grant; the new function gets a different OID and the GRANT goes to the wrong target — caught by re-applying from scratch)

```bash
SQL_FILES=$(git diff --name-only origin/main...HEAD | grep -E '^supabase/migrations/.*\.sql$' || true)

if [ -z "$SQL_FILES" ]; then
  : # No migrations in diff — skip
elif ! psql -d postgres -tA -c "SELECT 1" >/dev/null 2>&1; then
  echo "WARN: SQL compile-check skipped — no local Postgres reachable."
  echo "      Install: brew install postgresql && brew services start postgresql"
  echo "      Migrations in diff will be unverified until \`supabase db push\`:"
  for f in $SQL_FILES; do echo "        - $f"; done
else
  TEST_DB="ship_it_check_$$"
  createdb "$TEST_DB" >/dev/null 2>&1 || { echo "createdb failed — abort compile-check"; exit 1; }

  # Apply ALL migrations in numerical order to a fresh DB so cross-migration
  # references (helpers, tables, RPCs created by earlier migrations) resolve.
  # The new migration only being syntactically valid in isolation isn't enough.
  FAILED=""
  for f in supabase/migrations/*.sql; do
    if ! psql -d "$TEST_DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1; then
      FAILED="$f"
      break
    fi
  done

  if [ -n "$FAILED" ]; then
    echo "Compile-check FAILED at: $FAILED"
    echo "Re-run for full error:"
    echo "  psql -d $TEST_DB -v ON_ERROR_STOP=1 -f $FAILED"
    # Leave the test DB intact so the operator can inspect state if needed.
    # Drop with: dropdb $TEST_DB
    exit 1
  fi

  dropdb "$TEST_DB" >/dev/null 2>&1
  echo "SQL compile-check passed for migrations in diff:"
  for f in $SQL_FILES; do echo "  ✓ $f"; done
fi
```

**Failure handling:** if compile-check fails, the test DB is left intact (NOT dropped) so the operator can inspect state and re-run the failing migration interactively. The failure message includes the exact command to reproduce. Stop the pipeline and report.

**No local Postgres caveat:** the skill skips with a warning rather than failing. This is deliberate — environments without a local DB shouldn't block shipping JS-only changes that happen to share a branch with SQL. But the warning calls out the unverified surface explicitly so it doesn't get lost in PR review.

**Why not `supabase db reset --local`:** that requires Docker, which isn't reliably available on every dev machine (and explicitly wasn't during the session that motivated this step). Plain `psql + createdb/dropdb` works wherever PostgreSQL is installed — broader coverage than the Supabase CLI's Docker path.

---

## Step 3b: Simplify (conditional)

`/simplify` is JS/TS focused — its three agents (efficiency, quality, reuse) look for unused imports, dead code, trivial dupes. A SQL-only or docs-only diff has nothing for them to find.

```bash
# Files where /simplify has no surface to attack.
SIMPLIFY_SKIP='\.(md|mdx|txt|sql|css|scss|snap)$|^docs/|/(i18n|locales|fixtures|__fixtures__|__snapshots__)/|^supabase/migrations/|^(pnpm-lock\.yaml|package-lock\.json)$'
JS_FILES=$(git diff --name-only origin/main...HEAD | grep -vE "$SIMPLIFY_SKIP" | wc -l | tr -d ' ')
```

- If `JS_FILES == 0` → skip Step 3b with note: "no JS/TS surface in diff, simplify skipped"
- Otherwise → invoke `/simplify`

`/simplify` (the local skill at `.claude/skills/simplify/SKILL.md`) launches three parallel agents — efficiency, quality, reuse — auto-fixes safe wins (dead code, unused imports, trivial dupes), and proposes the judgment calls.

Apply the auto-fixes it lands. Address any `critical` proposals before proceeding. For `high`/`medium` proposals, apply the obvious ones and skip the rest unless they're cheap.

If any edits land, re-run the test loop (Step 3) to confirm nothing regressed.

For diffs spanning architectural boundaries (10+ files across packages, new cross-cutting modules), additionally invoke `improve-codebase-architecture` for the wider structural view.

---

## Step 3c: Harden (conditional)

`/ship-it` is autonomous — no human is watching to decide "is this change trivial enough to skip hardening?" So harden runs by default unless **every file in the diff** belongs to a category where harden cannot find anything (pure data, prose, or generated content).

```bash
# Skip patterns — files where harden has no surface to attack.
# Rationale per entry below this block.
SKIP='\.(md|mdx|txt|css|scss|snap)$|^docs/|/(i18n|locales|fixtures|__fixtures__|__snapshots__)/|^(pnpm-lock\.yaml|package-lock\.json)$'

NON_SKIP_FILES=$(git diff --name-only origin/main...HEAD | grep -vE "$SKIP" | wc -l | tr -d ' ')
```

**Skip pattern rationale (keep these in sync if the codebase shape changes):**

- `.md` / `.mdx` / `.txt` / `docs/` — prose, no executable surface
- `.css` / `.scss` — visual; behavior-affecting style is rare and Step 5 review catches it
- `.snap` / `__snapshots__/` — machine-generated test snapshots
- `i18n/` / `locales/` — translation strings (data, not logic)
- `fixtures/` / `__fixtures__/` — test data
- `pnpm-lock.yaml` / `package-lock.json` — when **only** the lockfile changed; a `package.json` change in the same diff will still register as a non-skip file and trigger harden (which is correct — dep adds have transitive surface)

**Explicitly NOT skipped** even though they may look low-stakes:

- `package.json`, `tsconfig*.json`, `*.config.ts/js`, `vercel.json`, `supabase/config.toml` — config files shape behavior and security boundaries
- `.claude/settings.json` (and `.claude/settings.local.json`) — agent permissions
- Anything under `supabase/migrations/` or `supabase/functions/` — the highest-stakes surface in this codebase

**Decision:**

- If `NON_SKIP_FILES == 0` → skip Step 3c with a logged note: "low-stakes diff (only [list extensions/dirs]), harden skipped"
- Otherwise → invoke `/harden`

Harden launches three parallel agents (edge cases, state corruption, security) and auto-fixes critical/high findings. After it completes:

- If harden returns `PASS` → proceed to Step 4
- If harden returns `FAIL` (critical findings remain after auto-fix, or 3+ high findings unfixed) → stop the pipeline and report. Do not proceed to commit. Surface the unfixed findings to the user and wait for direction.

If any harden auto-fixes landed, re-run the test loop (Step 3) before proceeding.

### When SQL migrations are in the diff — augment the harden prompt

The default harden agents read files but don't model the relational schema as a whole. They miss a class of bugs where a write-path filter (added in this migration) has no symmetric read-path filter (already-existing query that doesn't yet know about the new filter). The canonical example: a backfill that excludes `deleted_at IS NOT NULL` shows, but the validation RPC or edge function still iterates them and authenticates against derived codes.

When `git diff --name-only origin/main...HEAD | grep -q '^supabase/migrations/'` matches, prepend the following to the harden agents' security-pass prompt:

```
SQL CROSS-CUT AUDIT — this diff modifies the database schema or functions.
Before scoring this PASS:

1. Enumerate every WHERE clause, JOIN condition, and CHECK constraint
   the migration ADDS or CHANGES on any table.

2. For each such filter, grep the repo for OTHER queries that touch the
   same table without the same filter:
     - `git grep -E "from\s+(public\.)?<table>" -- '*.sql' '*.ts' '*.tsx'`
     - Edge functions in supabase/functions/
     - Replicated table classes in apps/*/services/replication/
     - Direct supabase.from('<table>') calls in apps/*/src/

3. For each match, ask: does this read path need the same filter to be
   coherent with the write-path semantics the migration is enforcing?
   Common patterns where the answer is YES:
     - Soft-delete (deleted_at IS NULL) — must apply to lookups too
     - Multi-tenant isolation (org_id = ...) — must apply to every read
     - Status gates (status IN ('active', ...)) — must apply to listings

4. If the answer is YES and the read path doesn't have the filter,
   flag as `critical` — the write path provisioned data the read path
   leaks back out.

5. Also check `GRANT EXECUTE TO <role>` statements: if the function
   signature changed (different return type, different parameter list),
   PostgreSQL treats it as a new function with a new OID. The old
   GRANT does NOT carry over. Re-GRANT explicitly in the same migration.
```

Auto-fixes for findings of this class should add the symmetric filter at every read site identified, not just the most-recently-touched one.

---

## Step 4: Commit and Open PR

Invoke `/commit` — it handles staging, typecheck, lint, tests, commit message, push.

Then open the PR:

```bash
BASE_SHA=$(git rev-parse origin/main)
HEAD_SHA=$(git rev-parse HEAD)

gh pr create --title "<conventional-commit-style title>" --body "$(cat <<'EOF'
## Summary
- <bullet per plan task>

## Test Plan
- [ ] pnpm typecheck passes
- [ ] pnpm lint passes
- [ ] related tests pass

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"

PR_NUMBER=$(gh pr view --json number -q '.number')
```

Note `$PR_NUMBER` and `$BASE_SHA` / `$HEAD_SHA` — needed for review.

---

## Step 5: Self-Review via Subagent

Spawn a code-review subagent using the Agent tool with `subagent_type: superpowers:code-reviewer`:

**Subagent prompt template:**
```
Review the following implementation.

WHAT_WAS_IMPLEMENTED: <summary from plan>
PLAN_OR_REQUIREMENTS: <plan file path>
BASE_SHA: <base_sha>
HEAD_SHA: <head_sha>
DESCRIPTION: PR #<number> — <title>

Repo path: /Users/richardbeezley/AI Projects/myk9-platform

Run `gh pr diff <number>` to see the full diff.

Check specifically for:
1. TypeScript correctness — no `any`, correct exactOptionalPropertyTypes usage
2. Test coverage — new logic has tests, no tests disabled
3. Logic errors, edge cases, boundary conditions
4. Security — RLS bypass, privilege escalation, unvalidated input, data integrity
5. CLAUDE.md conventions — pnpm not npm, offline-first patterns, files under 500 lines

Return EXACTLY one of:
- APPROVED
- A numbered list of issues, each with file:line and description, severity (critical/high/medium/low)
```

If subagent returns `APPROVED` → skip to Step 7.

---

## Step 6: Fix Loop (until clean)

Apply each finding (critical and high required; medium if straightforward):
- Read file before editing
- Minimal fix — do not refactor surrounding code

Invoke `/commit` to push fixes.

Re-spawn the review subagent (Step 5) with updated `HEAD_SHA`.

Repeat until `APPROVED`. **Max 5 review rounds** — stop and escalate to user if not clean after 5.

---

## Step 7: Squash-Merge — ALWAYS FROM MAIN REPO

**CRITICAL: Never run `gh pr merge` from inside a feature worktree.**

```bash
# 1. Verify not already merged (squash-merges fool git log)
gh pr view $PR_NUMBER --json state,mergedAt

# 2. cd to MAIN REPO before merging
cd "/Users/richardbeezley/AI Projects/myk9-platform"

# 3. Merge
gh pr merge $PR_NUMBER --squash --delete-branch

# 4. Confirm
gh pr view $PR_NUMBER --json state,mergedAt
```

Do not proceed to Step 8 until `state == "MERGED"`.

---

## Step 8: Cleanup — `git worktree remove` IS THE LAST COMMAND

```bash
# Already in main repo from Step 7
git fetch --prune
git checkout main
git pull --ff-only

# Identify worktree path
WORKTREE_PATH=$(git worktree list | grep "$BRANCH" | awk '{print $1}')

# LAST COMMAND — nothing runs after this line
git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
```

---

## Step 9: Handoff Doc

Output this summary after cleanup. Include the shared-system follow-ups section ONLY if the merged diff contains changes that need a post-merge operator action — otherwise omit that section entirely.

```bash
# Compute post-merge follow-ups from the merged diff
MIGRATIONS_CHANGED=$(gh pr diff $PR_NUMBER --name-only | grep -c '^supabase/migrations/' || echo 0)
FUNCTIONS_CHANGED=$(gh pr diff $PR_NUMBER --name-only | grep -E '^(supabase|apps/[^/]+/supabase)/functions/' | sed -E 's|.*/functions/([^/]+)/.*|\1|' | sort -u)
```

```
## Ship It — Complete

Plan:          <path>
Branch:        <branch>
PR:            #<number> — <title>
Merged at:     <mergedAt>
Review rounds: <N>

Shipped:
- <one bullet per completed plan task>

[If MIGRATIONS_CHANGED > 0]
Post-merge follow-ups (operator action required):
- supabase db push --linked   # applies <N> new migration(s)

[For each function in FUNCTIONS_CHANGED]
- supabase functions deploy <name> --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
  (touched: <relative path>)

[If both apply, sequence matters: db push BEFORE functions deploy when the
function calls a newly-created RPC or expects a new column.]
```

Both shared-system actions require explicit user confirmation per CLAUDE.md Auto Mode rules. The handoff lists them but does NOT run them — the operator decides timing.

---

## Rules

- NEVER run `gh pr merge` outside `/Users/richardbeezley/AI Projects/myk9-platform`
- NEVER remove the worktree before merge is confirmed AND main is updated
- `git worktree remove` is ALWAYS the absolute last command — nothing after it
- Before flagging any branch as unmerged, verify via `gh pr view --json state`, not `git log` (squash-merges rewrite SHAs)
- Use `pnpm`, never `npm` or `npx`
- Never add scope beyond the plan
- Max 10 test-fix iterations, max 5 review rounds — escalate if limits hit
- If SQL migrations are in the diff, the SQL compile-check (Step 3a) MUST run and pass — or skip with a logged warning if no local Postgres. Never commit a migration without at least the warning being surfaced.
- Never run `supabase db push` or `supabase functions deploy` automatically — these are operator actions surfaced in the handoff doc per CLAUDE.md Auto Mode rules.

## Edge Cases

**CWD lost after worktree removal:** If any Bash call fails with "getcwd", "cannot open current directory", or "No such file or directory" referencing the worktree path, immediately run `cd "/Users/richardbeezley/AI Projects/myk9-platform"` before any other command.

**Squash-merge false negative:** `git log origin/main..HEAD` shows commits after a squash-merge because SHAs differ. Always use `gh pr view --json state` to confirm merge status.

**Pre-existing typecheck failures:** If typecheck fails on files this branch did NOT touch, stop and report — do not silently fix pre-existing breakage.

**SQL compile-check left a test DB behind:** if Step 3a's `psql` call fails partway through (e.g., a migration errors), the script leaves `ship_it_check_<pid>` undropped on purpose so the operator can inspect state. If a previous failed run still has a DB lying around, drop it explicitly: `dropdb ship_it_check_<pid>` — or list orphans with `psql -c "SELECT datname FROM pg_database WHERE datname LIKE 'ship_it_check_%'"`. The next run uses a different `$$` so won't collide, but unused DBs accumulate until cleaned.

**`psql` is installed but no server is running:** the Step 3a detection runs `psql -d postgres -c "SELECT 1"` which fails fast (~50ms) if no server is listening. The skill correctly skips with a warning in that case. On macOS the typical fix is `brew services start postgresql`; on Linux it's `sudo systemctl start postgresql` or running a docker container.
