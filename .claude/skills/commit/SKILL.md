# Commit and Push

This skill should be used when the user wants to commit changes, push to GitHub, or asks to "save my work" or "commit this".

## Trigger Phrases

- "commit this", "commit my changes", "push to GitHub"
- "save my work", "git commit", "commit and push"
- `/commit`

## Workflow

### Step 1: Quality Checks

Run both in parallel.

```bash
pnpm typecheck
pnpm lint
```

**Handling failures:**

1. Check whether each failure is in a file the current commit touches (use `git diff --name-only` against staged + unstaged).
2. **If the failure is in a file this commit modifies** → fix it and re-run. Max 5 fix iterations; stop and report if still failing.
3. **If the failure is in a file this commit does NOT modify** (pre-existing breakage on main) → STOP. Do not silently fix it. Report the pre-existing failure to the user and ask whether to (a) bundle the drive-by fix into this commit, (b) commit only the intended changes as a separate commit first and file the pre-existing issue for later, or (c) abort. Drive-by fixes bloat commits and dilute commit purpose — the user decides, not the skill.

### Step 1b: Run Tests

Test scope is decided in two passes: **path-based overrides first**, then **count-based fallback**. Overrides exist because file count is a poor proxy for blast radius — a 1-file change to a shared package or RBAC context can break everything, while a 10-file dashboard refactor is well-contained.

List changed source files (excluding test files AND prose/data files that have no executable surface):

```bash
PROSE='\.(md|mdx|txt|css|scss|snap)$|^docs/|/(i18n|locales|fixtures|__fixtures__|__snapshots__)/|^(pnpm-lock\.yaml|package-lock\.json)$'
TESTS='\.(test|spec)\.(ts|tsx|js|jsx)$'

CHANGED=$(git diff --name-only HEAD | grep -vE "$TESTS" | grep -vE "$PROSE")
```

If `CHANGED` is empty (the diff is entirely prose, test edits, or low-stakes data), skip Step 1b with a logged note: "docs/data-only diff, no test run needed." This matches the Step 3c skip-list philosophy in `/ship-it`: same prose set, same fail-safe principle.

#### Pass 1: Path-based overrides (apply BEFORE counting)

Walk `$CHANGED` and classify. If any file matches an override, run that scope; multiple overrides combine (union of scopes).

| Path pattern | Run | Why |
|--------------|-----|-----|
| `packages/*/src/**` | **Both** apps' full suites | Shared monorepo packages are consumed cross-app; consumer-side breakage isn't covered by the package's own tests |
| `apps/myk9show/src/{lib,contexts}/**` | myK9Show full suite | Cross-cutting utilities and React contexts ripple through every screen |
| `apps/myk9q/src/{lib,contexts}/**` | myK9Q full suite | Same |
| `apps/*/vite.config.*`, `apps/*/tsconfig*.json`, root `tsconfig*.json`, root `*.config.{ts,js,mjs,cjs}` | That app's full suite (or both, if root config) | Build/type-system config affects every compilation unit |
| `supabase/migrations/**` | Both apps' full suites **AND** warn | Schema changes can break either app's queries. Note: no SQL-level test convention exists in this repo — flag the gap explicitly. |
| `supabase/functions/**` | Both apps' full suites if the function is called from client code; warn | Edge functions are an API boundary; affected callers may live in either app. |

If an override fires, log which one and skip Pass 2. Example log line:

```
Test scope: myK9Show full suite (override: apps/myk9show/src/contexts/AuthContext.tsx → contexts override)
```

#### Pass 2: Count-based fallback (only if no override fired)

Count `$CHANGED` files.

**If >3 source files → run the full app suite(s) for the affected app(s):**

```bash
# myK9Show
cd apps/myk9show && pnpm vitest run --reporter=default --exclude '**/integration/**' --exclude '**/debug-*.test.*'

# myK9Q
cd apps/myk9q && pnpm vitest run --reporter=default
```

**If ≤3 source files → run related tests only:**

Identify test files related to the modified source files:

- For `src/components/Foo.tsx` → look for `Foo.test.tsx`, `Foo.test.ts`
- For `src/services/Bar.ts` → look for `Bar.test.ts`
- For `src/hooks/useBaz.ts` → look for `useBaz.test.ts`

If related test files exist, run them:

```bash
cd apps/myk9show && pnpm vitest run <test-file> --reporter=verbose
cd apps/myk9q && pnpm vitest run <test-file> --reporter=verbose
```

**If no related test files exist** for a changed source file — do NOT silently skip. Log it as a visible coverage gap before proceeding:

```
Coverage gap: 2 of 3 changed source files have no related test:
  - apps/myk9show/src/components/widgets/NewWidget.tsx
  - apps/myk9show/src/utils/formatter.ts
Commit will proceed without test coverage for these files.
```

Don't create new tests during a commit — but surface the gap so the user can decide whether to add tests in a follow-up.

#### Failure handling (both passes)

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

- NEVER skip quality checks
- NEVER commit if checks fail — fix first
- Maximum 5 fix iterations per check (typecheck, lint, tests) — if still failing, stop and report
- ALWAYS push after committing (per project convention)
- Use HEREDOC for commit messages
- Include `Co-Authored-By` trailer for AI-assisted commits
- Do NOT create new test files during a commit — only run existing ones
- Ignore known flaky tests (see MEMORY.md pre-existing failures list)
