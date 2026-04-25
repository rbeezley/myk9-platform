---
name: qa-feature
description: Use when the user wants a real-browser audit of an existing feature — "QA the clubs section", "walk the secretary journey", "audit dogs CRUD", `/qa-feature <area>`. Drives the live app with playwright-cli, fixes bugs at the root cause mid-walk, and leaves behind a committed Playwright spec plus unit tests for any pure logic extracted.
---

# QA Feature

Use when the user wants a real-browser audit of an existing feature — "QA the clubs section", "walk the secretary journey", "audit dogs CRUD", `/qa-feature <area>`. This skill drives the live app with `playwright-cli`, finds bugs from real interaction, fixes them at the root cause, and leaves behind a committed Playwright spec plus unit tests for any pure logic extracted along the way.

This is the engine for **Phase 2 — Walk the Golden Paths** (see `docs/plans/strategy/2026-04-11-north-star-fall-2026.md`). Every role-journey audit should run through this skill so the pattern stays consistent and the artifacts compound.

## Trigger Phrases

- "QA <area>", "audit <area>", "walk <role>'s journey through <area>"
- "test the <area> UI end-to-end"
- `/qa-feature <area>`

## Inputs

Before starting, establish:

- **Area** — which feature/page (e.g. `clubs`, `dogs`, `entries → check-in`).
- **Role** — `admin` / `secretary` / `user` / `judge`. Default `admin` only if the user doesn't say. Phase 2 work usually wants `secretary` or `user`.
- **Scope of CRUD** — which create/edit/delete operations to exercise. Default: every visible action.
- **Persistence rule** — which entities to leave behind in the DB vs. clean up. Default: create 2–3 with timestamped names, delete only one.

If any of these are unclear, ask once before recording.

## Workflow

### Step 0 — Pre-flight

```bash
# Dev server on :5173
curl -sf http://localhost:5173 >/dev/null || echo "NOT_RUNNING"
# If not running:
pnpm dev:show &
# Wait for it to bind
until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done
```

Confirm the linked Supabase project matches the dev DB. Real-bug fixes that touch RLS will write a migration — that needs `supabase db push` later, which is a shared-system write and requires user confirmation.

### Step 1 — Sign in

Use `playwright-cli` for the recording session. Pull the credentials for the chosen role from `apps/myk9show/src/test/e2e/helpers/testUsers.ts`:

```bash
playwright-cli open http://localhost:5173/sign-in
playwright-cli fill <email-ref> "<role-email>"
playwright-cli fill <password-ref> "Test123!"
playwright-cli click <submit-ref>
playwright-cli snapshot
```

Optionally save storage state so you can resume mid-recording without re-typing credentials:

```bash
playwright-cli state-save .playwright-cli/<role>-state.json
```

**Note:** the saved state contains a Supabase JWT that typically expires in 1 hour. Long recording sessions will start hitting 401s — re-sign-in if that happens. The committed spec re-signs-in fresh per `test.beforeAll`, so the storage-state file is recording-only convenience, never a CI artifact.

### Step 2 — Record the walk

Walk every visible feature in the area, snapshot after each meaningful interaction. Recommended order:

1. **List/browse** — load, search, filter chips, view toggle, clear filters
2. **Create** — at least 2 entities with timestamped names, plus one validation-failure attempt
3. **Detail** — visit each tab, exercise inline actions, dropdown menus
4. **Edit** — change fields, save; change fields, cancel
5. **Delete** — confirmation cancel path, then confirmation accept path on ONE entity

After every step, run:

```bash
playwright-cli console        # JS errors → app bug
playwright-cli network        # failed API calls → app bug or RLS denial
```

### Step 3 — Classify findings as you go

For each unexpected behavior, decide before continuing:

| Symptom                                                | Class                                        | Action                               |
| ------------------------------------------------------ | -------------------------------------------- | ------------------------------------ |
| Locator not found, wrong field                         | Script bug                                   | Adjust the recording, keep going     |
| Action visible but silently fails (4xx/5xx in network) | App bug — usually RLS / missing role gate    | **Fix the source** before continuing |
| UI shows the wrong state after a save                  | App bug — missing invalidation / stale cache | Fix in source                        |
| Console error on page load                             | App bug                                      | Fix in source                        |

Don't queue app bugs for later — fixing mid-walk is the whole point. Each fix gets a real commit; don't mash them into one.

### Step 4 — Fix root causes, not symptoms

For role-gate bugs (Add button visible to a user the RLS will reject, etc.):

1. Read the relevant RLS policy in `supabase/migrations/` to find the source of truth
2. Gate the UI to **match** the policy, never to lie about it
3. If the RLS itself is wrong, fix it with a migration — number it via `supabase migration list` against the linked project, never reuse a number

For permission logic that lives in a hook: extract a pure helper (e.g. `computeXPermissions`), put it in a sibling file, write vitest unit tests for it. The unit tests run in CI even when the e2e env vars aren't set, so coverage compounds.

### Step 5 — Write the spec

Target file: `apps/myk9show/src/test/e2e/entities/<area>UI.spec.ts`. Conventions (match the pattern from `clubsUI.spec.ts` shipped in PR #88):

- Define local `signIn(page, email, password)` plus thin `signInAs<Role>(page)` wrappers near the top of the spec, importing credentials (`SECRETARY_EMAIL`, `ADMIN_EMAIL`, etc.) from `apps/myk9show/src/test/e2e/helpers/testUsers.ts`. Do **not** invent a `TestSetup.signIn(role)` — no such helper exists today.
- Sign in inside each `test()` (or in a `test.beforeEach`), not `test.beforeAll`. Playwright's parallel workers each get a fresh page; `beforeAll` doesn't share auth across them. The clubs spec sign-ins per test for this reason.
- One `describe` per UI surface (Browse, Create, Detail, Edit, Delete)
- Timestamped entity names: `` `E2E <Area> A ${Date.now()}` ``
- **No `waitForTimeout`.** Always `waitForResponse` against the relevant `/rest/v1/<table>` POST/PATCH/DELETE, or `waitForURL` for navigation
- Document any RLS / migration assumption in a top-of-file comment with the migration number

### Step 6 — Run it

```bash
cd apps/myk9show && pnpm test:e2e <area>UI.spec.ts
```

Iterate until green. If a step fails:

- **Locator drift:** regenerate from a fresh `playwright-cli snapshot`
- **Timing:** swap the wait for a `waitForResponse` on the actual XHR
- **App regression:** classify as Step 3 and fix at the source

Cap: 5 iterations. Stop and report if not green by then.

### Step 7 — Unit tests

For any pure helper extracted in Step 4, write a `*.test.ts` next to it. Run:

```bash
cd apps/myk9show && npx vitest run src/path/to/helper.test.ts
```

All cases must pass before commit.

### Step 8 — Hand off to ship-pr

Once spec + unit tests are green, invoke `/ship-pr`. The ship-pr workflow handles simplify → commit → PR → self-review → merge → cleanup. Don't reinvent it here.

## Output Artifacts

A successful run produces:

1. A committed `*.spec.ts` under `apps/myk9show/src/test/e2e/entities/`
2. Zero or more sibling `*.test.ts` for extracted pure helpers
3. Zero or more source-code fixes for app bugs found during the walk (each its own commit when feasible)
4. Zero or one new RLS migration (if a real policy gap was found)
5. A PR description that lists: bugs found, files touched, migration number (if any), and a checkbox for the user to apply the migration to staging

## Rules

- **Never skip an app bug to keep the recording flowing.** A spec that passes against a buggy app codifies the bug.
- **Never use `waitForTimeout` in the committed spec.** It's a flake factory. The recording session can use it, the spec cannot.
- **Never reuse a migration number.** Always run `supabase migration list` against the linked project before picking one.
- **Never commit `.playwright-cli/` artifacts.** It's gitignored; storage state for a role belongs in CI secrets, not the repo.
- **Never run `supabase db push` without explicit confirmation** (per `CLAUDE.md` Auto Mode rule for shared-system writes).
- **Don't wander.** If you spot a bug outside the area being audited, use `mcp__ccd_session__spawn_task` to flag it; don't fix it in this PR. Phase 2 has a "no wandering" rule for a reason.

## When NOT to Use

- Greenfield throwaway prototypes — use `playwright-cli` directly without the spec/unit-test ceremony
- Pure-logic refactors with no UI surface — vitest unit tests are enough
- One-off "does this button work" checks — just open the browser

## Related Skills / Agents

- `playwright-cli` — the recording tool used in Steps 1–3
- `playwright-test-healer` agent — dispatch when an existing spec starts flaking after merge
- `playwright-test-generator` agent — alternative path if the user wants the spec generated from a structured plan rather than a free-form recording
- `ship-pr` — handoff target in Step 8
- `simplify`, `commit` — invoked by ship-pr, not directly here
