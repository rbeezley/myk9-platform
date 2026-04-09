# Commit and Push

This skill should be used when the user wants to commit changes, push to GitHub, or asks to "save my work" or "commit this".

## Trigger Phrases

- "commit this", "commit my changes", "push to GitHub"
- "save my work", "git commit", "commit and push"
- `/commit`

## Workflow

### Step 1: Quality Checks

Run both in parallel. If either fails, fix errors and re-run. Maximum 5 fix iterations — if still failing after 5 attempts, stop and report what's unresolved.

```bash
pnpm typecheck
pnpm lint
```

### Step 1b: Run Tests

Count the number of source files being changed (not test files). Use `git diff --stat` from Step 2 or `git status` to determine this.

**If >3 source files changed → run the full app test suite:**

```bash
# myK9Show
cd apps/myk9show && pnpm vitest run --reporter=default --exclude '**/integration/**' --exclude '**/debug-*.test.*'

# myK9Q
cd apps/myk9q && pnpm vitest run --reporter=default
```

Run only the suite(s) for the app(s) that have changed files.

**If ≤3 source files changed → run related tests only:**

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

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Step 5: Push

Always push after committing. Do not ask — just push.

```bash
git push
```

If upstream not set:

```bash
git push -u origin HEAD
```

### Step 6: Confirm

```bash
git log --oneline -1
git status
```

Report the commit hash and confirm push succeeded.

## Rules

- NEVER skip quality checks
- NEVER commit if checks fail — fix first
- Maximum 5 fix iterations per check (typecheck, lint, tests) — if still failing, stop and report
- ALWAYS push after committing (per project convention)
- Use HEREDOC for commit messages
- Include `Co-Authored-By` trailer for AI-assisted commits
- Do NOT create new test files during a commit — only run existing ones
- Ignore known flaky tests (see MEMORY.md pre-existing failures list)
