---
name: commit
description: Use when the user wants to commit changes, push to GitHub, save work, run git commit, or invokes /commit. Picks a risk-appropriate validation level, runs the scoped tests, commits with a conventional message, and pushes.
---

# Commit and Push

This skill should be used when the user wants to commit changes, push to GitHub, or asks to "save my work" or "commit this".

This file is shared by Claude Code and Codex (`.agents/skills/commit` is a symlink to it). Merging a PR is **not** part of this skill — that is `/ship-pr`, which owns the review gate, the merge, and the cleanup order.

## Trigger Phrases

- "commit this", "commit my changes", "push to GitHub"
- "save my work", "git commit", "commit and push"
- `/commit`

## Workflow

### Step 0: In-flight check — is someone already doing this?

```bash
pnpm qa:inflight            # exit 1 if an open PR, another worktree (even uncommitted), or an unmerged local branch touches the paths this branch changes
# Before ANY work exists, name the paths you intend to touch — with nothing to check it exits 2, not 0:
# pnpm qa:inflight apps/myk9show/src/features/entries .claude/skills/ship-pr
```

Stop on a hit and coordinate: read the named PR or branch, and either take over that work, rebase onto it, or drop yours. Then the two checks the script cannot do from a shell: Linear issues **In Progress** that name these paths, and (Claude Code) `list_sessions` for another session on the same area. On 2026-09-05 #2062 was open for 43 minutes before #2064 started on the same directories; both then paid a dozen review rounds.

### Step 1: Choose Validation Level

Classify the change before running checks. Use `git diff --name-only` and `git diff --stat`. If unsure, choose the higher level.

- **Micro review follow-up**: comments/docs, test-only changes, helper tests, copy tweaks, or a very small review nit that does not alter production behavior.
- **Low-risk focused change**: ≤3 production source files in one app/module, no DB/auth/payment/offline/cross-app behavior.
- **High-risk change**: shared helpers used across modules, entry submission, payment, auth/RLS, database migrations, offline/replication, cross-app changes, or >3 production source files.

### Step 1a: Quality Checks

Run the narrowest checks that match the level.

**Micro review follow-up** — related tests only (Step 1b, focused). Skip local typecheck/lint unless production TypeScript changed; if it did, run the app-local typecheck:

```bash
cd apps/myk9show && npx tsc --noEmit -p tsconfig.app.json
```

Never `-p tsconfig.json` — that file is solution-style and typechecks nothing while exiting 0.

**Low-risk focused change** — app-local typecheck and lint:

```bash
pnpm --filter @myk9/show typecheck
pnpm --filter @myk9/show lint
```

**High-risk change** — the full gates, redirected so the real exit status is visible (a pipe through `tail`/`grep` reports the filter's exit code):

```bash
pnpm typecheck > /tmp/typecheck.log 2>&1; echo "EXIT=$?"
pnpm lint > /tmp/lint.log 2>&1; echo "EXIT=$?"
```

If the change ADDS lines to an existing file, also run `pnpm qa:code-quality-ratchet` from the worktree — CI's Quality Checks job runs it and nothing in typecheck, lint, or the test suite approximates it.

**Handling failures:**

1. Check whether each failure is in a file the current commit touches (use `git diff --name-only` against staged + unstaged).
2. **If the failure is in a file this commit modifies** → fix it and re-run. Max 5 fix iterations; stop and report if still failing.
3. **If the failure is in a file this commit does NOT modify** (pre-existing breakage on main) → STOP. Do not silently fix it. Report the pre-existing failure to the user and ask whether to (a) bundle the drive-by fix into this commit, (b) commit only the intended changes as a separate commit first and file the pre-existing issue for later, or (c) abort. Drive-by fixes bloat commits and dilute commit purpose — the user decides, not the skill.

### Step 1b: Run Tests

For **micro** follow-ups, run only the focused tests the change touches and let CI provide the broad signal after push.

For **low-risk** and **high-risk** changes, test scope is decided in two passes: **path-based overrides first**, then **count-based fallback**. Overrides exist because file count is a poor proxy for blast radius — a 1-file change to a shared package or RBAC context can break everything, while a 10-file dashboard refactor is well-contained.

List changed source files (excluding test files AND prose/data files that have no executable surface):

```bash
PROSE='\.(md|mdx|txt|css|scss|snap)$|^docs/|/(i18n|locales|fixtures|__fixtures__|__snapshots__)/|^(pnpm-lock\.yaml|package-lock\.json)$'
TESTS='\.(test|spec)\.(ts|tsx|js|jsx)$'

CHANGED=$(git diff --name-only HEAD | grep -vE "$TESTS" | grep -vE "$PROSE")
```

If `CHANGED` is empty (the diff is entirely prose, test edits, or low-stakes data), skip Step 1b with a logged note: "docs/data-only diff, no test run needed."

#### Pass 1: Path-based overrides (apply BEFORE counting)

Walk `$CHANGED` and classify. If any file matches an override, run that scope; multiple overrides combine (union of scopes).

| Path pattern                                                                                            | Run                                                                           | Why                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/*/src/**`                                                                                     | The package's suite AND the myK9Show full suite                               | Shared packages are consumed by the app; consumer-side breakage isn't covered by the package's own tests. Rebuild first (`pnpm --filter @myk9/<pkg> build`) — app tests import the built `dist`; `pnpm qa:dist-fresh` fails if any is stale, and `pnpm test` in the app runs it automatically. |
| `apps/myk9show/src/{lib,contexts}/**`                                                                   | myK9Show full suite                                                           | Cross-cutting utilities and React contexts ripple through every screen                                                                                                                                                                                                                         |
| `apps/*/vite.config.*`, `apps/*/tsconfig*.json`, root `tsconfig*.json`, root `*.config.{ts,js,mjs,cjs}` | myK9Show full suite                                                           | Build/type-system config affects every compilation unit                                                                                                                                                                                                                                        |
| `supabase/migrations/**`                                                                                | `apps/myk9show/src/test/database/` contract suite AND the myK9Show full suite | Schema changes break queries silently. Behavioral SQL tests run only in CI (no local container runtime), so registering one is not the same as having run it.                                                                                                                                  |
| `supabase/functions/**`                                                                                 | The function's tests AND the myK9Show full suite if client code calls it      | Edge functions are an API boundary. A new edge-function test must be registered in BOTH `vitest.config.ts` `include` and `tsconfig.edge-tests.json`.                                                                                                                                           |

If an override fires, log which one and skip Pass 2. Example log line:

```
Test scope: myK9Show full suite (override: apps/myk9show/src/contexts/AuthContext.tsx → contexts override)
```

#### Pass 2: Count-based fallback (only if no override fired)

Count `$CHANGED` files.

**If >3 source files → run the full app suite**, redirected so the real exit status is visible:

```bash
cd apps/myk9show && pnpm vitest run --reporter=default --exclude '**/integration/**' --exclude '**/debug-*.test.*' > /tmp/suite.log 2>&1; echo "EXIT=$?"
grep -E '^ (Test Files|Tests) ' /tmp/suite.log
```

**If ≤3 source files → run related tests only.** Identify test files related to the modified source files:

- For `src/components/Foo.tsx` → look for `Foo.test.tsx`, `Foo.test.ts`
- For `src/services/Bar.ts` → look for `Bar.test.ts`
- For `src/hooks/useBaz.ts` → look for `useBaz.test.ts`

If related test files exist, run them (at most two positional path filters per invocation — vitest 4 finds **no files** with three or more):

```bash
cd apps/myk9show && pnpm vitest run <test-file> --reporter=verbose
```

**If no related test files exist** for a changed source file — do NOT silently skip. Log it as a visible coverage gap before proceeding:

```
Coverage gap: 2 of 3 changed source files have no related test:
  - apps/myk9show/src/components/widgets/NewWidget.tsx
  - apps/myk9show/src/utils/formatter.ts
Commit will proceed without test coverage for these files.
```

Don't create new tests during a commit — but surface the gap so the user can decide whether to add tests in a follow-up.

For UI/state bugs, prefer extracting pure state helpers and testing those directly when the component harness is slow or flaky — but keep at least one test on the real caller when the fix adds a field a projection could drop (a unit test on the pure function cannot see a last-hop `.map(...)` that discards it).

#### Shuffled runs for any test you added or touched

CI runs vitest with `--sequence.shuffle`; local runs do not. Run the **whole** suite shuffled 6+ times before pushing a new or changed test — a subset cannot show a leak between files, and `pnpm test --sequence.shuffle` never reaches vitest (pnpm claims the flag):

```bash
cd apps/myk9show && pnpm vitest run --sequence.shuffle > /tmp/shuffle.log 2>&1; echo "EXIT=$?"
```

#### Failure handling (both passes)

If tests fail:

1. Read the failure output carefully
2. Fix the root cause (not just symptoms)
3. Re-run the failing tests
4. Maximum 5 fix iterations — stop and report if still failing

### Step 2: Review Changes

```bash
git status
git diff --stat
git diff
git log -3 --oneline
```

- Review staged and unstaged changes
- Identify what changed and why

### Step 3: Stage Changes

```bash
git add <specific-files>
```

- Stage files relevant to the current work
- Do NOT stage `.env`, credentials, or secrets — warn if detected
- Prefer specific files over `git add .` — in a shared checkout a blind `git add -A` sweeps another agent's WIP

### Step 4: Commit

Draft a conventional commit message:

- Prefix: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Scope: affected area (e.g., `entries`, `scoring`, `ui`)
- Summary: concise, present tense, under 70 chars
- Body: bullet points explaining WHY, not what
- Trailer: the `Co-Authored-By` line the instruction file (`CLAUDE.md` / `AGENTS.md`) prescribes for your harness

```bash
git commit -m "$(cat <<'EOF'
type(scope): summary

- Why this change matters
- Impact on users/developers

Co-Authored-By: <harness trailer from the instruction file>
EOF
)"
```

### Step 5: Push

Push after committing. A push to a feature branch needs no confirmation; a push to `main`, or any `--force`, is a shared-system mutation that does (Auto Mode rules in the instruction file).

```bash
git push
```

If upstream not set:

```bash
git push -u origin HEAD
```

### Step 5b: Migration Deploy Check

After pushing, check if this commit touched a migration file. If so, remind the user to deploy to Supabase — `git push` does NOT deploy DB migrations, and `supabase db push` must not run from an unmerged branch.

```bash
if git diff HEAD~1 --name-only | grep -q '^supabase/migrations/'; then
  echo "⚠️  Migration changed — after merge, run: source supabase/.env && supabase db push --password \"\$SUPABASE_DB_PASSWORD\""
fi
```

### Step 6: Confirm

```bash
git log --oneline -1
git status
```

Report the commit hash and confirm push succeeded.

## Rules

- NEVER skip validation, but choose the risk-appropriate level above
- NEVER commit if checks fail — fix first
- Maximum 5 fix iterations per check (typecheck, lint, tests) — if still failing, stop and report
- Push after committing; confirm only for `main` or `--force`
- Use HEREDOC for commit messages
- Include the harness `Co-Authored-By` trailer for AI-assisted commits
- Do NOT create new test files during a commit — only run existing ones
- Do NOT merge from this skill — hand off to `/ship-pr`
