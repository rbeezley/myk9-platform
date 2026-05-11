---
name: commit
description: Use when the user wants to commit changes, push to GitHub, save work, run git commit, or invokes /commit.
---

# Commit and Push

This skill should be used when the user wants to commit changes, push to GitHub, or asks to "save my work" or "commit this".

## Trigger Phrases

- "commit this", "commit my changes", "push to GitHub"
- "save my work", "git commit", "commit and push"
- `/commit`

## Workflow

### Step 1: Choose Validation Level

Classify the change before running checks.

- **Micro review follow-up**: comments/docs, test-only changes, helper tests, copy tweaks, or a very small review nit that does not alter production behavior.
- **Low-risk focused change**: ≤3 production source files in one app/module, no DB/auth/payment/offline/cross-app behavior.
- **High-risk change**: shared helpers used across modules, entry submission, payment, auth/RLS, database migrations, offline/replication, cross-app changes, or >3 production source files.

Use `git diff --name-only` and `git diff --stat` to classify. If unsure, choose the higher level.

### Step 1a: Quality Checks

Run the narrowest checks that match the risk level:

**Micro review follow-up**

```bash
# Run related tests only. Skip full local typecheck/lint unless production TypeScript changed.
cd apps/myk9show && pnpm exec vitest run <related-test-file>
```

If TypeScript production code changed, also run the app-local typecheck when available, or the narrowest package check:

```bash
pnpm --filter @myk9/show typecheck
```

**Low-risk focused change**

```bash
pnpm --filter @myk9/show typecheck
pnpm --filter @myk9/show lint
```

Run related tests only.

For UI/state bugs, prefer extracting pure state helpers and testing those directly when the component harness is slow, flaky, or hangs. Do not add slow integration coverage when a fast helper test captures the same behavior.

**High-risk change**

```bash
pnpm typecheck
pnpm lint
```

Then run related or full app tests per Step 1b.

If `--filter` is not available for the affected package, fall back to the closest app-local command or full `pnpm typecheck` / `pnpm lint`.

**Handling failures:**

1. Check whether each failure is in a file the current commit touches (use `git diff --name-only` against staged + unstaged).
2. **If the failure is in a file this commit modifies** → fix it and re-run. Max 5 fix iterations; stop and report if still failing.
3. **If the failure is in a file this commit does NOT modify** (pre-existing breakage on main) → STOP. Do not silently fix it. Report the pre-existing failure to the user and ask whether to (a) bundle the drive-by fix into this commit, (b) commit only the intended changes as a separate commit first and file the pre-existing issue for later, or (c) abort. Drive-by fixes bloat commits and dilute commit purpose — the user decides, not the skill.

### Step 1b: Run Tests

Choose tests from the risk and behavioral surface of the change, not from raw file count alone. File count is only a signal that should prompt a closer look.

For **micro review follow-ups**, do not run the full suite locally. Run only the focused tests touched by the follow-up and let CI provide the broad signal after push.

**Run the full app test suite when the change is broad or high-risk:**

- Shared providers, auth/RBAC, payments, offline/replication, database/RLS, routing shells, or core data flows
- Cross-module behavior where focused tests do not exercise the real integration
- Refactors that change logic in many places, even if each edit is small
- User-facing workflows where regressions would not be caught by typecheck/lint plus focused tests

```bash
# myK9Show
cd apps/myk9show && pnpm vitest run --reporter=default --exclude '**/integration/**' --exclude '**/debug-*.test.*'

# myK9Q
cd apps/myk9q && pnpm vitest run --reporter=default
```

Run only the suite(s) for the app(s) that have changed files.

**Run focused tests when the change is narrow or mechanically repeated:**

- Localized component fixes
- Repeated API usage fixes with the same pattern across many files
- Test helper/script/doc changes
- UI warning cleanups verified by a targeted route walk or focused regression test

For these, run related tests only:

Identify test files related to the modified source files:

- For `src/components/Foo.tsx` → look for `Foo.test.tsx`, `Foo.test.ts`
- For `src/services/Bar.ts` → look for `Bar.test.ts`
- For `src/hooks/useBaz.ts` → look for `useBaz.test.ts`

If related test files exist, run them:

```bash
# myK9Show tests
cd apps/myk9show && pnpm vitest run <test-file> --reporter=verbose

# myK9Q tests
cd apps/myk9q && pnpm vitest run <test-file> --reporter=verbose
```

If no related test files exist, skip this step (don't create tests during a commit).

If tests fail:

1. Read the failure output carefully
2. Fix the root cause (not just symptoms)
3. Re-run the failing tests
4. Maximum 5 fix iterations — stop and report if still failing

**Known flaky tests to ignore:** PresenceService.test.ts, PerformanceService.test.ts (see MEMORY.md for details).

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
- Prefer specific files over `git add .` when possible

### Step 4: Commit

Draft a conventional commit message:

- Prefix: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Scope: affected area (e.g., `myk9q`, `scoring`, `ui`)
- Summary: concise, present tense, under 70 chars
- Body: bullet points explaining WHY, not what

```bash
git commit -m "$(cat <<'EOF'
type(scope): summary

- Why this change matters
- Impact on users/developers

Co-Authored-By: Codex <noreply@anthropic.com>
EOF
)"
```

### Step 5: Push

Push after committing unless AGENTS.md requires confirmation for the current operation. GitHub pushes and PR creation are shared-system mutations in this repo, so ask for confirmation before pushing if it has not already been granted for this sequence.

```bash
git push
```

If upstream not set:

```bash
git push -u origin HEAD
```

### Step 5b: Migration Deploy Check

After pushing, check if this commit touched a migration file. If so, remind the user to deploy to Supabase — `git push` does NOT deploy DB migrations.

```bash
if git diff HEAD~1 --name-only | grep -q '^supabase/migrations/'; then
  echo "⚠️  Migration changed — run: source supabase/.env && supabase db push --password \"\$SUPABASE_DB_PASSWORD\""
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
- For shared-system mutations, follow AGENTS.md confirmation rules before pushing
- Use HEREDOC for commit messages
- Include `Co-Authored-By` trailer for AI-assisted commits
- Do NOT create new test files during a commit — only run existing ones
- Ignore known flaky tests (see MEMORY.md pre-existing failures list)
