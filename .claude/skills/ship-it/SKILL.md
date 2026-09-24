---
name: ship-it
description: Use when given a docs/plan-*.md path to autonomously implement, test, simplify and harden a feature, then ship it through ship-pr (PR, independent review gate, merge, cleanup) with no human input until final merge confirmation. For OpenSpec changes use opsx:ship or opsx-orchestrate instead.
---

# Ship It — Autonomous PR Pipeline

Takes a plan path and ships it end-to-end: implement → test loop → migration audit → simplify → harden → `ship-pr` (commit, PR, review gate, merge, close-out, cleanup).

This skill owns everything up to a hardened, green working tree. From there `ship-pr` owns the rest, so the review gate, merge and cleanup rules live in ONE place. Do not restate or shortcut them here.

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

**Then re-capture `BRANCH` and `WORKTREE`, and do not skip this.** Step 0 read
them from wherever you started — usually the primary checkout on `main`. If a
worktree was created just now, those variables still name the OLD checkout, and
`ship-pr` later resolves the branch to decide what to `git worktree remove --force`. That
is a force-remove of somebody else's checkout, with their uncommitted work in
it. Re-read after every worktree transition:

```bash
BRANCH=$(git branch --show-current)
WORKTREE=$(git rev-parse --show-toplevel)
# dirname "$(...)", never `| xargs dirname` — xargs splits on spaces, so under
# "AI Projects" it returns two mangled paths and the test silently passes.
PRIMARY=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
test "$WORKTREE" != "$PRIMARY" \
  || { echo "Refusing to continue: still in the primary checkout"; exit 1; }
echo "implementing $BRANCH in $WORKTREE"
```

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

---

## Changed files (used by Steps 3a–3c)

Nothing is committed yet, so a committed range (`origin/main...HEAD`) is empty here and would skip every conditional step. List the working tree against the merge base, plus untracked files:

```bash
changed_files() {
  { git diff --name-only "$(git merge-base origin/main HEAD)"; git ls-files --others --exclude-standard; } | sort -u
}
```

## Step 3a: Migration audit (conditional)

If `changed_files | grep -q '^supabase/migrations/'`:

1. Dispatch the `migration-auditor` agent on each new or changed migration file and fix what it finds.
2. Run the database contract suite from the worktree root, and stop on a non-zero exit — fix the failure and re-run before Step 3b:

   ```bash
   mkdir -p .logs
   (cd apps/myk9show && pnpm vitest run src/test/database/) > .logs/ship-it-db.log 2>&1
   DB_STATUS=$?
   echo "EXIT=$DB_STATUS"
   [ "$DB_STATUS" -eq 0 ] || { echo "DB contract suite failed — see .logs/ship-it-db.log"; exit 1; }
   ```

3. There is no local Docker, so migrations are not replayed here; the behavioral SQL tests and the full replay run only in CI. Say so in the PR body rather than implying they ran.

---

## Step 3b: Simplify (conditional)

`/simplify` is JS/TS focused — its three agents (efficiency, quality, reuse) look for unused imports, dead code, trivial dupes. A SQL-only or docs-only diff has nothing for them to find.

```bash
# Files where /simplify has no surface to attack.
SIMPLIFY_SKIP='\.(md|mdx|txt|sql|css|scss|snap)$|^docs/|/(i18n|locales|fixtures|__fixtures__|__snapshots__)/|^supabase/migrations/|^(pnpm-lock\.yaml|package-lock\.json)$'
JS_FILES=$(changed_files | grep -vE "$SIMPLIFY_SKIP" | wc -l | tr -d ' ')
```

- If `JS_FILES == 0` → skip Step 3b with note: "no JS/TS surface in diff, simplify skipped"
- Otherwise → invoke `/simplify`

`/simplify` (the local skill at `.claude/skills/simplify/SKILL.md`) launches three parallel agents — efficiency, quality, reuse — auto-fixes safe wins (dead code, unused imports, trivial dupes), and proposes the judgment calls.

Apply the auto-fixes it lands. Address any `critical` proposals before proceeding. For `high`/`medium` proposals, apply the obvious ones and skip the rest unless they're cheap.

If any edits land, re-run the test loop (Step 3) to confirm nothing regressed.

---

## Step 3c: Harden (conditional)

`/ship-it` is autonomous — no human is watching to decide "is this change trivial enough to skip hardening?" So harden runs by default unless **every file in the diff** belongs to a category where harden cannot find anything (pure data, prose, or generated content).

```bash
# Skip patterns — files where harden has no surface to attack.
# Rationale per entry below this block.
SKIP='\.(md|mdx|txt|css|scss|snap)$|^docs/|/(i18n|locales|fixtures|__fixtures__|__snapshots__)/|^(pnpm-lock\.yaml|package-lock\.json)$'

NON_SKIP_FILES=$(changed_files | grep -vE "$SKIP" | wc -l | tr -d ' ')
```

**Skip pattern rationale (keep these in sync if the codebase shape changes):**

- `.md` / `.mdx` / `.txt` / `docs/` — prose, no executable surface
- `.css` / `.scss` — visual; behavior-affecting style is rare and the review gate catches it
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

When `changed_files | grep -q '^supabase/migrations/'` matches, prepend the following to the harden agents' security-pass prompt:

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

## Step 4: Ship through `ship-pr`

Invoke the `ship-pr` skill on this branch (its Step A simplify already ran as Step 3b; skip it). It runs `/commit`, opens the PR (put one bullet per completed plan task in its Summary, and link the plan), asks `pnpm qa:review-tier` for the floor, runs the independent cross-harness review gate, merges from the main repo, closes out the Linear issue, and removes the worktree last.

- The `/ship-it` request authorizes the push and PR creation. Merging still needs the user's explicit go-ahead, so `ship-pr` stops for final merge confirmation unless the user said to ship through completion.
- A same-harness subagent is never the review gate. That rule, the review-round limit and the merge mechanics are `ship-pr`'s; follow them there.

---

## Step 5: Handoff summary

After `ship-pr` finishes (or arms auto-merge and stops), report. If the shell's CWD was the removed worktree, `cd "/Users/richardbeezley/AI Projects/myk9-platform"` first. Include the follow-ups section only when the merged diff needs an operator action:

```bash
# `grep ... | wc -l`, not `grep -c ... || echo 0`: grep -c prints 0 AND exits 1, giving "0\n0".
MIGRATIONS_CHANGED=$(gh pr diff $PR_NUMBER --name-only | grep '^supabase/migrations/' | wc -l | tr -d ' ')
FUNCTIONS_CHANGED=$(gh pr diff $PR_NUMBER --name-only | grep -E '^(supabase|apps/[^/]+/supabase)/functions/' | sed -E 's|.*/functions/([^/]+)/.*|\1|' | sort -u)
```

```
## Ship It — Complete

Plan:   <path>
PR:     #<number> — <title> (merged <mergedAt> | auto-merge armed)
Shipped:
- <one bullet per completed plan task>

[If MIGRATIONS_CHANGED > 0 or FUNCTIONS_CHANGED]
Post-merge follow-ups (operator action, use the `deploy` skill; each needs confirmation):
- supabase db push            # <N> new migration(s); BEFORE functions that call new RPCs/columns
- supabase functions deploy <name> --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
- Frontend goes live only on the next Deploy myK9Show run.
```

---

## Rules

- Never add scope beyond the plan.
- Max 10 test-fix iterations — escalate if hit.
- If harden returns FAIL, stop before `ship-pr`.
- Never run `supabase db push`, `supabase functions deploy` or the Deploy myK9Show workflow automatically; list them in the handoff.
- Pre-existing typecheck failures in files this branch did not touch: stop and report, do not fix silently.
