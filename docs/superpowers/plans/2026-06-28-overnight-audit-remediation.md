# Overnight Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 2026-06-28 overnight launch-readiness audit into small, reviewable PRs that improve QA signal, documentation truth, route inventory, and secretary/show-day reliability.

**Architecture:** Treat the audit as evidence, not as a mandate to build new surfaces. First remove stale QA/docs references so verification becomes trustworthy. Then rerun authenticated route-health now that E2E credentials are repaired. Only after that, address the two product-boundary questions: Show Map move-up lifecycle ownership and canonical homes for waitlist/volunteer workflows.

**Tech Stack:** TypeScript, React, React Router, Vitest, Playwright, pnpm, Supabase Auth, myK9Show route registry, myK9Show docs/QA markdown.

## Global Constraints

- Before editing code or docs for any task, run `git branch --show-current` and `git rev-parse --git-dir --git-common-dir`. If the checkout is primary `main`, create or enter a feature worktree first unless the task is docs-only direct-to-main work explicitly allowed by AGENTS.md.
- Follow `docs/goals/fall-2026-launch-readiness.md` for prioritization; secretary/show-day reliability wins ties.
- Consolidate, do not duplicate: link/deep-link to existing canonical surfaces before creating new pages or controls.
- Before UX-facing implementation, preserve `docs/INTENT.md`: secretary work should feel "That was easy"; offline/show-day flows should stay calm.
- Do not rebuild deleted `apps/myk9q`; current ringside work belongs in myK9Show `/at-show` unless explicitly scoped otherwise.
- Use pnpm, not npm.
- Use TypeScript for app code.
- Keep files under 500 lines when modifying code; extract only when a task genuinely needs it.
- For persistent show-day data that must work offline, use replicated tables/query layers and existing mutation helpers instead of direct Supabase reads/writes.
- Confirm before any shared-system write, including Supabase Auth resets, `supabase db push`, GitHub PR creation, or GitHub push/merge operations when required by AGENTS.md.
- Every task has a testing phase. Do not mark a task complete until its listed checks pass or the failure is recorded as pre-existing with evidence.

---

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The plan includes docs-only cleanup, but later tasks touch authenticated E2E, route registry/page-directory contracts, and offline-first Show Map move-up behavior, so each PR needs the focused checks listed in its task plus CI before merge.

---

## Scope And PR Boundaries

This plan intentionally splits the audit into five PR-sized units:

1. **PR 1: QA/docs truth cleanup** — low-risk markdown and QA inventory cleanup.
2. **PR 2: Authenticated route-health and active Nightly proof** — rerun broad route-health after credential repair, rerun the exact active Phase 2 Nightly command, and update QA records.
3. **PR 3: Route inventory/page-directory alignment** — make docs source-map claims and page-directory/route-registry tests agree.
4. **PR 4: Show Map move-up boundary review** — verify or adjust Show Map move-up lifecycle ownership.
5. **PR 5: Secretary IA decisions** — document the canonical waitlist/volunteer route decisions and avoid duplicate surfaces.

If PR 2 finds product failures, open a separate fix plan for those failures instead of expanding PR 2.

## Autonomous Overnight Execution Order

This plan is intended to run unattended overnight. An unattended worker cannot answer a confirmation prompt and must never block on a human-gated step. Classify the PRs accordingly:

**Unattended-safe tonight:**

1. **PR 1 (docs cleanup)** — docs-only, eligible for direct-to-`main` per AGENTS.md. Commit and push directly; no PR needed.
2. **PR 3 (route registry / pageDirectory)** — touches app code. Implement, run its tests, **open a PR, and stop. Do not merge unattended.**
3. **PR 4 (Show Map move-up boundary)** — touches app code. Its test scaffolding already exists in `showMapActionMutations.test.ts` (all referenced mocks are defined there). Implement, run its tests, **open a PR, and stop. Do not merge unattended.** This PR does **not** depend on PR 2: its scope is locking the offline mutation boundary with tests, which the E2E route-health result cannot invalidate (any product failure PR 2 finds becomes its own fix plan).
4. **PR 5 (secretary IA docs)** — docs-only by default; stay in the docs-only scope and skip the optional `secretaryRoutes.tsx` code branch unless a human opts in. Direct-to-`main` eligible.

**Supervised — defer to a watched session, do NOT run overnight:**

- **PR 2 (authenticated route-health + Nightly replay)** — this is the one task that genuinely needs a human:
  - It may require a **Supabase Auth reset** (`setup-e2e-test-users.ts`) if credentials have drifted again — a shared-system write that AGENTS.md requires confirming. An unattended worker must NOT run it.
  - It runs ~20 Playwright specs at `--workers=1` with long timeouts. Per CLAUDE.md, a runner that hangs >30s must be stopped and reported, not retried. With no human watching, a stall sits inconclusive until morning, and `QA-TEST-FLAKE-027` is itself an active-suite timeout cluster — a likely outcome, not an edge case.
  - Leave PR 2 as a morning task. If the overnight worker reaches it, it should record "deferred — requires supervised run (Auth-reset confirmation + hang triage)" and move on.

**Never block on a merge.** Where a later PR depends on an earlier one, rebase onto the earlier branch — do not wait for it to be merged. Merges and PR creation are human-gated; unattended runs open PRs and stop.

## Implementation Setup For Each PR

- [ ] **Step 1: Start from a clean feature worktree unless the PR is docs-only**

Run:

```bash
git branch --show-current
git rev-parse --git-dir --git-common-dir
git status --short
```

Expected: work happens in a linked worktree for app-code tasks. For docs-only tasks, primary `main` is allowed only inside the docs-only direct-to-main scope and only if unrelated dirty files are ignored.

- [ ] **Step 2: Protect unrelated work**

If `git status --short` shows files unrelated to the task, do not stage or revert them. Use the explicit `git add` commands listed in the task being implemented.

- [ ] **Step 3: Keep PRs independent (rebase, never wait for a merge)**

Merges are human-gated and will not happen during an unattended run, so no task may block on one. If Task 3 needs Task 1's docs, rebase Task 3's branch onto Task 1's branch — do not wait for Task 1 to merge. Task 4 does not depend on Task 2 and may proceed independently (see Autonomous Overnight Execution Order). Task 2 is supervised-only and is skipped during overnight runs.

## File Map

- `docs/audits/2026-06-28-overnight-launch-readiness-sweep.md` — source audit and final remediation status updates.
- `docs/qa/e2e-suite-map.md` — remove stale missing Playwright spec from the manual-debug inventory.
- `docs/qa/findings.md` — update `QA-TEST-FLAKE-027` after route-health reruns.
- `docs/qa/nightly-history.md` — add a short dated proof entry after authenticated route-health rerun.
- `docs/user-guides/README.md` — make guide status notes match screenshot evidence.
- `docs/user-guides/workflow-source-map.md` — canonical route/concern mapping and sidebar/pageDirectory gap truth.
- `docs/training/screenshot-shot-list.md` — remove or correct stale waitlist and query-style show-desk screenshot rows.
- `apps/myk9show/src/test/e2e/route-health-by-role.spec.ts` — route-health command target; change only if the rerun proves stale test data or missing route coverage.
- `apps/myk9show/src/routes/routeRegistry.ts` — add missing route registry entries only for real, routed pages.
- `apps/myk9show/src/features/admin-help/data/pageDirectory.ts` — add missing user-facing page entries only after `routeRegistry.ts` has matching paths.
- `apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts` — extend invariants for the newly cataloged routes.
- `apps/myk9show/src/features/show-map/showMapActionMutations.ts` — offline-first Show Map move-up mutation boundary.
- `apps/myk9show/src/features/show-map/__tests__/showMapActionMutations.test.ts` — regression tests for move-up, undo, rollback, and audit logging.
- `apps/myk9show/src/services/database/entries/lifecycle.ts` — canonical online lifecycle seam.
- `apps/myk9show/src/services/database/day-of-operations/move-up.ts` — online day-of move-up orchestration, already lifecycle-backed.
- `apps/myk9show/src/routes/secretaryRoutes.tsx` — current `/secretary/waitlist` redirect and `/secretary/volunteers` standalone route.

---

## Task 1: QA Inventory And Guide Status Cleanup

**Files:**

- Modify: `docs/qa/e2e-suite-map.md`
- Modify: `docs/user-guides/README.md`
- Modify: `docs/training/screenshot-shot-list.md`
- Modify: `docs/user-guides/workflow-source-map.md`
- Modify: `docs/audits/2026-06-28-overnight-launch-readiness-sweep.md`

**Interfaces:**

- Consumes: audit finding that `pnpm qa:e2e-map:check` fails on deleted `apps/myk9show/src/test/e2e/playwright-real-auth.spec.ts`.
- Produces: docs and QA inventory that match the current route/code state so later route-health work starts from a clean inventory.

- [ ] **Step 1: Remove the deleted Playwright spec from the suite map**

Edit `docs/qa/e2e-suite-map.md` and remove this row from the **Manual Debug** table:

```markdown
| `apps/myk9show/src/test/e2e/playwright-real-auth.spec.ts` | Real-auth investigation flow, likely environment-dependent. |
```

- [ ] **Step 2: Run the E2E suite-map check and confirm the failure is gone**

Run:

```bash
pnpm qa:e2e-map:check
```

Expected: PASS. If it still fails, remove only rows for files that no longer exist and rerun.

- [ ] **Step 3: Update guide status notes to match captured screenshots**

Edit `docs/user-guides/README.md`:

Replace the `Secretary Guide` note:

```markdown
Phase 0 gate met (2026-06-19); screenshots pending; § 11 Closeout stub (feature not built)
```

with:

```markdown
Phase 0 gate met (2026-06-19); screenshot list partially captured; § 11 Closeout stub (feature not built)
```

Replace the `Exhibitor Guide` note:

```markdown
Phase 0 gate met (2026-06-19); § 10 stub (route not in pageDirectory); screenshots pending
```

with:

```markdown
Phase 0 gate met (2026-06-19); E-01–E-17 captured; § 10 stub (route not in pageDirectory)
```

Replace the `Ringside Quickstart` note:

```markdown
Drafted 2026-06-24 (flag removed, surface unblocked); printable single page; J-01–J-06 + access-paths diagram pending capture; live walk pending
```

with:

```markdown
Drafted 2026-06-24; J-01–J-06 captured; access-paths diagram drawn; live walk pending
```

- [ ] **Step 4: Correct the stale waitlist and show-desk screenshot rows**

Edit `docs/training/screenshot-shot-list.md`.

Replace row `S-10`:

```markdown
| S-10 | Waitlist Management page | `/secretary/waitlist/:showId` | `secretary@myk9t.com` | Desktop | At least one waitlisted entry | § 4 | `ready` |
```

with:

```markdown
| S-10 | Entry Management — Exceptions / Move-ups queue | `/shows/:showId/entry-management?tab=exceptions` | `e2e-secretary@test.myk9.com` | Desktop | Exceptions tab visible; move-up queue selected | § 4 | `needs recapture — replaces stale waitlist route` |
```

Replace row `S-17`:

```markdown
| S-17 | Show Desk — move-up dialog | `/shows/:showId?phase=show-desk` | `secretary@myk9t.com` | Desktop | Move-up dialog open; target class picker visible | § 7 | `ready` |
```

with:

```markdown
| S-17 | Show Desk — move-up dialog | `/shows/:showId/show-desk` | `e2e-secretary@test.myk9.com` | Desktop | Move-up dialog open; target class picker visible | § 7 | `ready` |
```

- [ ] **Step 5: Clarify waitlist/scoring docs in workflow source map**

Edit `docs/user-guides/workflow-source-map.md`.

Under secretary workflows, add or update the entry-management outcome so waitlist appears as part of Entry Management, not as `/secretary/waitlist/:showId`:

```markdown
### 4. Review entries and exception queues

**Outcome:** Secretary approves, rejects, waitlists, or reviews move-up/pull exceptions for entries in one canonical management surface.
**Canonical route:** `/shows/:showId/entry-management`
**Note:** Do not document `/secretary/waitlist/:showId`; the current `/secretary/waitlist` route redirects to the dashboard.
**Docs target:** Secretary Guide § Entry Management, KB: `entry-status.md`
```

Add the scoring distinction:

```markdown
### 9. Ringside scoring and paper-scoring fallback

**Outcome:** Judges and stewards use `/at-show`; secretary paper-scoring support remains separate when needed.
**Canonical routes:** `/at-show` → `/at-show/:showId`; paper scoring: `/scoring/classes/:classId/entries`
**Docs target:** Ringside Quickstart; Secretary Guide § Show Day
```

- [ ] **Step 6: Update the audit status for completed docs cleanup**

Edit `docs/audits/2026-06-28-overnight-launch-readiness-sweep.md` and add this note under **Recommended Next Work** after the first PR bullet list:

```markdown
**Remediation status:** Pending until PR 1 removes the stale suite-map entry and reconciles guide screenshot status.
```

When PR 1 is complete, change `Pending` to `Complete` and link the PR number.

- [ ] **Step 7: Run docs checks**

Run:

```bash
pnpm qa:e2e-map:check
pnpm qa:doc-staleness:strict
pnpm exec prettier --check docs/qa/e2e-suite-map.md docs/user-guides/README.md docs/training/screenshot-shot-list.md docs/user-guides/workflow-source-map.md docs/audits/2026-06-28-overnight-launch-readiness-sweep.md
git diff --check
```

Expected: all commands pass.

- [ ] **Step 8: Commit PR 1**

Run:

```bash
git add docs/qa/e2e-suite-map.md docs/user-guides/README.md docs/training/screenshot-shot-list.md docs/user-guides/workflow-source-map.md docs/audits/2026-06-28-overnight-launch-readiness-sweep.md
git commit -m "docs(qa): reconcile overnight audit inventory"
```

---

## Task 2: Authenticated Route-Health And Active Nightly Proof

> **⚠️ SUPERVISED ONLY — do NOT run during an unattended overnight session.** This task may require a Supabase Auth reset (shared-system write, must be confirmed) and runs long Playwright suites prone to hangs that need live triage. An overnight worker should record "deferred — requires supervised run" and skip to Task 3/4/5. Run this only with a human watching.

**Files:**

- Modify: `docs/qa/findings.md`
- Modify: `docs/qa/nightly-history.md`
- Modify: `docs/audits/2026-06-28-overnight-launch-readiness-sweep.md`
- Modify only if proven stale: `apps/myk9show/src/test/e2e/route-health-by-role.spec.ts`

**Interfaces:**

- Consumes: repaired E2E Auth users and focused secretary proof from 2026-06-28.
- Produces: broad authenticated route-health evidence for secretary, exhibitor, judge, club-admin, and admin, plus a current active Nightly result that can close or keep open `QA-TEST-FLAKE-027` with the right proof threshold.

- [ ] **Step 1: Run the full route-health suite**

Run from `apps/myk9show`:

```bash
pnpm test:e2e:clean src/test/e2e/route-health-by-role.spec.ts --project=chromium --workers=1 --timeout=30000 --retries=0
```

Expected: all route-health role groups pass. If a group fails at sign-in with `Invalid login credentials`, rerun `pnpm exec tsx scripts/setup-e2e-test-users.ts` only after confirming shared-system write approval for Supabase Auth.

- [ ] **Step 2: Run the exact Phase 2 active Nightly Playwright command**

Run from `apps/myk9show` with retries disabled, matching `docs/qa/e2e-suite-map.md`:

```bash
pnpm test:e2e:clean \
  src/test/e2e/simple-connectivity.spec.ts \
  src/test/e2e/basic/registrationSmoke.spec.ts \
  src/test/e2e/browse-shows-to-details.spec.ts \
  src/test/e2e/cross-role-workflows.spec.ts \
  src/test/e2e/uat/secretary/qa-regression-proof.spec.ts \
  src/test/e2e/uat/secretary/critical-path.spec.ts \
  src/test/e2e/uat/secretary/disposable-entry.spec.ts \
  src/test/e2e/uat/secretary/evidence.spec.ts \
  src/test/e2e/secretary/show-creation-wizard.spec.ts \
  src/test/e2e/secretary/classCreation.spec.ts \
  src/test/e2e/registration/secretaryExistingUsers.spec.ts \
  src/test/e2e/registration/secretaryNewUsers.spec.ts \
  src/test/e2e/registration/index.spec.ts \
  src/test/e2e/registration/singleDogSingleClass.spec.ts \
  src/test/e2e/registration/exhibitorSelfRegistration.spec.ts \
  src/test/e2e/secretary-entry-walk.spec.ts \
  src/test/e2e/secretary/show-wizard-officials.spec.ts \
  src/test/e2e/registration/entryCreationCore.spec.ts \
  src/test/e2e/public-shows-responsive.spec.ts \
  src/test/e2e/route-health-by-role.spec.ts \
  --project=chromium --workers=1 --timeout=90000 --retries=0
```

Expected: the command completes under the 30-minute global Nightly budget. `QA-TEST-FLAKE-027` cannot be closed from standalone route-health alone; closure requires this Phase 2 command plus standalone Phase 3 route-health to pass.

- [ ] **Step 3: If either suite fails, classify each failure before editing**

Use this table in the PR notes:

```markdown
| Command             | Spec or role group | Failure type                                                  | Evidence path                                     | Action                         |
| ------------------- | ------------------ | ------------------------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| route-health/phase2 | secretary          | product-route / stale-test / data-state / auth / suite-budget | `apps/myk9show/test-results/.../error-context.md` | fix / document / separate plan |
```

Only edit `apps/myk9show/src/test/e2e/route-health-by-role.spec.ts` when the failure is stale test route data. Do not hide a product failure by removing a route from the sweep.

- [ ] **Step 4: Update QA finding `QA-TEST-FLAKE-027`**

Edit `docs/qa/findings.md` under `QA-TEST-FLAKE-027`.

If route-health and Phase 2 active Nightly pass, append:

```markdown
- **2026-06-28 update — E2E credentials repaired and active proof replayed.** E2E Auth users were reset via `apps/myk9show/scripts/setup-e2e-test-users.ts`; standalone `route-health-by-role.spec.ts --project=chromium --workers=1 --timeout=30000 --retries=0` passed, then the exact Phase 2 active Nightly command from `docs/qa/e2e-suite-map.md` passed under the 30-minute budget with `--retries=0`. Close `QA-TEST-FLAKE-027` only if the run has no residual failures from the tracked active-suite timeout cluster.
```

If either command finds product/test/data failures, use:

```markdown
- **2026-06-28 update — credentials repaired; active proof still red.** E2E Auth users were reset and sign-in no longer blocks the suite. Standalone route-health and/or the exact Phase 2 active Nightly command now fail after authentication on the specs, roles, or routes listed in this PR's failure table. Keep `QA-TEST-FLAKE-027` open until those failures are fixed, demoted with rationale, or split into separate findings.
```

- [ ] **Step 5: Update nightly history**

Append a dated line to `docs/qa/nightly-history.md` near the latest June 2026 entries:

```markdown
### 2026-06-28 — Authenticated route-health replay after credential repair

- **Standalone route-health command:** `pnpm test:e2e:clean src/test/e2e/route-health-by-role.spec.ts --project=chromium --workers=1 --timeout=30000 --retries=0`
- **Phase 2 active Nightly command:** exact command from `docs/qa/e2e-suite-map.md`, run with `--retries=0`.
- **Result:** Use the exact Playwright summaries from both runs, for example `route-health: 6 passed (2.8m); Phase 2: 50 passed (3.2m)`.
- **Notes:** E2E Auth credentials no longer fail at sign-in; any remaining failures are product/test/data/suite-budget issues, not credential drift.
```

- [ ] **Step 6: Update the audit**

Edit `docs/audits/2026-06-28-overnight-launch-readiness-sweep.md`.

In **Verification Results**, add a new row:

```markdown
| Full authenticated route-health replay | Passed or failed based on the Playwright summary | Run after E2E credential repair on 2026-06-28; include exact passed/failed counts and the first failing role/route if any. |
| Phase 2 active Nightly replay | Passed or failed based on the Playwright summary and duration | Required for `QA-TEST-FLAKE-027` closure; include exact passed/failed counts and whether the run stayed under the 30-minute budget. |
```

- [ ] **Step 7: Run docs formatting and diff checks**

Run:

```bash
pnpm exec prettier --check docs/qa/findings.md docs/qa/nightly-history.md docs/audits/2026-06-28-overnight-launch-readiness-sweep.md
git diff --check
```

Expected: both pass.

- [ ] **Step 8: Commit PR 2**

Run:

```bash
git add docs/qa/findings.md docs/qa/nightly-history.md docs/audits/2026-06-28-overnight-launch-readiness-sweep.md apps/myk9show/src/test/e2e/route-health-by-role.spec.ts
git commit -m "test(e2e): record authenticated route-health replay"
```

If `route-health-by-role.spec.ts` was not modified, omit it from `git add`.

---

## Task 3: Route Registry And Page Directory Alignment

**Files:**

- Modify: `apps/myk9show/src/routes/routeRegistry.ts`
- Modify: `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`
- Modify: `apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts`
- Modify: `docs/user-guides/workflow-source-map.md`

**Interfaces:**

- Consumes: current route declarations in `adminRoutes.tsx`, `publicRoutes.tsx`, `secretaryRoutes.tsx`, and `clubAdminRoutes.tsx`.
- Produces: `pageDirectory.ts` and `workflow-source-map.md` that no longer claim unresolved sidebar gaps for real pages.

- [ ] **Step 1: Add missing route-registry entries for real routed pages**

Edit `apps/myk9show/src/routes/routeRegistry.ts`.

Add these entries to `adminRouteComponents`:

```typescript
'/admin/users': () => import('@/pages/admin/UserManagementPage'),
'/admin/payouts': () => import('@/pages/admin/PayoutLedgerPage'),
```

Add these entries to `publicRouteComponents`:

```typescript
'/exhibitor/payments': () => import('@/pages/exhibitor/ExhibitorPaymentsPage'),
```

Add these entries to `secretaryRouteComponents`:

```typescript
'/people': () => import('@/pages/BrowsePeoplePage'),
```

Add these entries in a new `clubAdminRouteComponents` object and include it in `fullRouteRegistry`:

```typescript
export const clubAdminRouteComponents: Record<string, ImportFunction> = {
  '/club-admin/members': () => import('@/pages/club-admin/ClubMembersPage'),
  '/club-admin/payments': () => import('@/pages/club-admin/ClubPaymentsPage'),
} as const;
```

Then update:

```typescript
export const fullRouteRegistry: Record<string, ImportFunction> = {
  ...adminRouteComponents,
  ...publicRouteComponents,
  ...secretaryRouteComponents,
  ...judgeRouteComponents,
  ...clubAdminRouteComponents,
};
```

- [ ] **Step 2: Add page-directory entries**

Edit `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`.

Add entries matching these paths and roles:

```typescript
{
  path: '/admin/users',
  title: 'User Management',
  description: 'Search, review, and manage platform user accounts.',
  roles: [UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Admin',
  status: 'working',
  linksTo: [],
},
{
  path: '/admin/role-requests',
  title: 'Role Requests',
  description: 'Review and resolve pending access requests.',
  roles: [UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Admin',
  status: 'working',
  linksTo: [],
},
{
  path: '/admin/payouts',
  title: 'Payout Ledger',
  description: 'Review club payout status and payment ledger details.',
  roles: [UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Admin',
  status: 'working',
  linksTo: [],
},
{
  path: '/people',
  title: 'People',
  description: 'Find, add, and manage people records used by shows and clubs.',
  roles: [UserRole.SECRETARY, UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'People',
  status: 'working',
  linksTo: [],
},
{
  path: '/exhibitor/payments',
  title: 'My Payments',
  description: 'Review personal entry payment history and payment status.',
  roles: [UserRole.EXHIBITOR],
  classification: 'critical-path',
  category: 'Exhibitor',
  status: 'working',
  linksTo: ['/exhibitor/entries'],
},
{
  path: '/club-admin/members',
  title: 'Club Members',
  description: 'Manage club members and member roles.',
  roles: [UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Club Admin',
  status: 'working',
  linksTo: [],
},
{
  path: '/club-admin/payments',
  title: 'Club Payments',
  description: 'Review club payment and Stripe onboarding status.',
  roles: [UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Club Admin',
  status: 'working',
  linksTo: ['/club-admin/members'],
},
```

If `UserRole.CLUB_ADMIN` is not the exact enum member name, inspect `apps/myk9show/src/types/auth-types.ts` and use the actual value.

- [ ] **Step 3: Strengthen the invariant test**

Edit `apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts`.

Add:

```typescript
it('catalogs sidebar-visible role pages that are safe for customer docs', () => {
  const paths = pageDirectory.map(e => e.path);
  expect(paths).toEqual(
    expect.arrayContaining([
      '/admin/users',
      '/admin/role-requests',
      '/admin/payouts',
      '/people',
      '/exhibitor/payments',
      '/club-admin/members',
      '/club-admin/payments',
    ])
  );
});
```

- [ ] **Step 4: Remove resolved gap rows from workflow source map**

Edit `docs/user-guides/workflow-source-map.md` and delete the resolved rows from **Sidebar vs pageDirectory Gap Audit** after tests prove they are in `pageDirectory.ts`.

If all rows are resolved, replace the table with:

```markdown
No sidebar-visible customer-documentable routes are currently missing from `pageDirectory.ts`.
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/features/admin-help/__tests__/pageDirectory.test.ts src/routes/routeRegistry.test.ts
pnpm --filter @myk9/show typecheck
pnpm exec prettier --check apps/myk9show/src/routes/routeRegistry.ts apps/myk9show/src/features/admin-help/data/pageDirectory.ts apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts docs/user-guides/workflow-source-map.md
git diff --check
```

Expected: all commands pass.

- [ ] **Step 6: Commit PR 3**

Run:

```bash
git add apps/myk9show/src/routes/routeRegistry.ts apps/myk9show/src/features/admin-help/data/pageDirectory.ts apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts docs/user-guides/workflow-source-map.md
git commit -m "docs(routes): align page directory with sidebar routes"
```

---

## Task 4: Show Map Move-Up Lifecycle Boundary

> **Unattended-safe.** All mocks the Step 1 tests reference (`mockCreateReplicatedEntry`, `mockUpdateReplicatedEntry`, `mockProcessMoveUp`, `mockFrom`, `mockAuditLog`) are already defined at the top of `showMapActionMutations.test.ts` — the snippets run as pasted. This task does not depend on Task 2. Implement, run tests, open a PR, and stop; do not merge unattended.

**Files:**

- Modify: `apps/myk9show/src/features/show-map/showMapActionMutations.ts`
- Modify: `apps/myk9show/src/features/show-map/__tests__/showMapActionMutations.test.ts`
- Modify only if adding a shared adapter: `apps/myk9show/src/services/database/entries/lifecycle.ts`
- Modify: `docs/audits/2026-06-28-overnight-launch-readiness-sweep.md`

**Interfaces:**

- Consumes: existing offline-first Show Map replicated mutations and online lifecycle-backed move-up orchestration.
- Produces: either a small shared lifecycle adapter for replicated move-up status writes or explicit documentation that Show Map owns this offline-first mutation boundary.

- [ ] **Step 1: Write the boundary tests first**

Edit `apps/myk9show/src/features/show-map/__tests__/showMapActionMutations.test.ts`.

Add tests that prove:

```typescript
it('rolls back the original entry to its exact previous status when replicated move-up creation fails', async () => {
  mockCreateReplicatedEntry.mockRejectedValueOnce(new Error('create failed'));

  await expect(
    moveUpShowMapEntry({
      entryId: 'entry-1',
      targetClassId: 'class-2',
      reason: 'Qualified today',
    })
  ).rejects.toThrow('create failed');

  expect(mockUpdateReplicatedEntry).toHaveBeenNthCalledWith(
    1,
    'entry-1',
    expect.objectContaining({
      entryStatus: 'moved',
      entry_status: 'moved',
    })
  );
  expect(mockUpdateReplicatedEntry).toHaveBeenNthCalledWith(
    2,
    'entry-1',
    expect.objectContaining({
      entryStatus: 'checked-in',
      entry_status: 'checked-in',
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
      specialRequests: 'Bring paper form',
      special_requests: 'Bring paper form',
    })
  );
});
```

and:

```typescript
it('keeps Show Map move-up fully replicated and audit logged', async () => {
  await moveUpShowMapEntry({
    entryId: 'entry-1',
    targetClassId: 'class-2',
    reason: 'Qualified today',
  });

  expect(mockFrom).not.toHaveBeenCalled();
  expect(mockProcessMoveUp).not.toHaveBeenCalled();
  expect(mockAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({
      entityType: 'entry',
      entityId: 'entry-1',
      metadata: expect.objectContaining({ action: 'mark_entry_moved' }),
    })
  );
});
```

- [ ] **Step 2: Run tests and confirm the current boundary**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/features/show-map/__tests__/showMapActionMutations.test.ts
```

Expected: tests pass or expose a specific rollback/audit gap.

- [ ] **Step 3: Implement the smallest boundary fix**

If tests expose no gap, keep the implementation as-is and add this comment above `moveUpShowMapEntry` in `apps/myk9show/src/features/show-map/showMapActionMutations.ts`:

```typescript
// INTENT: Show Map move-up stays on replicated entry mutations because this
// action is show-day/offline-critical. The online day-of path routes status
// changes through entries/lifecycle.ts; this path mirrors the same domain
// transition locally, audit-logs it, and relies on sync/server review as the
// backstop for stale replicas or concurrent capacity changes.
```

If tests expose a concrete gap, fix that gap in `showMapActionMutations.ts` without routing the offline-critical path through direct Supabase writes.

- [ ] **Step 4: Update the audit with the boundary decision**

Edit `docs/audits/2026-06-28-overnight-launch-readiness-sweep.md`.

Replace the Show Map lifecycle recommendation with:

```markdown
**Remediation decision:** Show Map move-up remains a replicated offline-first adapter. The online day-of move-up path uses `entries/lifecycle.ts`; Show Map mirrors that transition locally and audit-logs it. Follow-up tests lock rollback, undo, and audit behavior.
```

If code changes more than a comment, describe the exact behavior fixed.

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/features/show-map/__tests__/showMapActionMutations.test.ts src/features/show-map/__tests__/showMapActions.test.ts src/features/show-map/__tests__/ShowMapTab.test.tsx
pnpm --filter @myk9/show typecheck
git diff --check
```

Expected: all commands pass.

- [ ] **Step 6: Commit PR 4**

Run:

```bash
git add apps/myk9show/src/features/show-map/showMapActionMutations.ts apps/myk9show/src/features/show-map/__tests__/showMapActionMutations.test.ts docs/audits/2026-06-28-overnight-launch-readiness-sweep.md
git commit -m "test(show-map): lock move-up lifecycle boundary"
```

---

## Task 5: Secretary Waitlist And Volunteer Canonical Surface Decisions

**Files:**

- Modify: `docs/user-guides/workflow-source-map.md`
- Modify: `docs/training/screenshot-shot-list.md`
- Modify: `docs/audits/2026-06-28-overnight-launch-readiness-sweep.md`
- Modify only if implementing route redirects/deep-links: `apps/myk9show/src/routes/secretaryRoutes.tsx`
- Modify only if adding tests: `apps/myk9show/src/routes/routeRegistry.test.ts` or a nearby secretary route test

**Interfaces:**

- Consumes: current `/secretary/waitlist` dashboard redirect, current standalone `/secretary/volunteers`, and Entry Management exceptions queue.
- Produces: explicit canonical route decisions so future docs and UI work do not reintroduce duplicate surfaces.

- [ ] **Step 1: Record the duplication questions before changing code**

Add this section to `docs/user-guides/workflow-source-map.md` under secretary workflows:

```markdown
## Secretary Canonical Surface Decisions

### Waitlist

**Decision:** Waitlist work belongs in Entry Management, not a standalone `/secretary/waitlist/:showId` page.
**Canonical route:** `/shows/:showId/entry-management`
**Why this does not duplicate another page:** Entry Management already owns entry review states and exception queues.

### Volunteers

**Decision:** Keep `/secretary/volunteers` as the canonical volunteer scheduling page through launch unless Setup grows a dedicated personnel panel.
**Canonical route:** `/secretary/volunteers`
**Why this does not duplicate another page:** Show Setup may link to this page, but does not reimplement volunteer assignment.
```

- [ ] **Step 2: Decide whether `/secretary/waitlist` needs a stronger redirect**

If no code change is needed, document this in the audit:

```markdown
`/secretary/waitlist` remains a legacy redirect to `/secretary/dashboard`; customer docs now point waitlist work to `/shows/:showId/entry-management`.
```

If a deep-link redirect is useful, change `apps/myk9show/src/routes/secretaryRoutes.tsx` so `/secretary/waitlist` redirects to a canonical entry-management route only when there is reliable show context. Do not create a new waitlist page.

- [ ] **Step 3: Decide whether Setup should link to Volunteers**

Search for existing Setup quick links before adding anything:

```bash
rg -n "volunteer|Volunteers|secretary/volunteers" apps/myk9show/src/pages apps/myk9show/src/features apps/myk9show/src/components
```

If Setup already links to Volunteers, document that route as canonical. If no link exists, create a separate small implementation plan for a Setup deep-link. Do not add the link in this PR unless the owner explicitly chooses that scope.

- [ ] **Step 4: Run focused docs checks**

Run:

```bash
pnpm qa:doc-staleness:strict
pnpm exec prettier --check docs/user-guides/workflow-source-map.md docs/training/screenshot-shot-list.md docs/audits/2026-06-28-overnight-launch-readiness-sweep.md
git diff --check
```

If `secretaryRoutes.tsx` changes, also run:

```bash
pnpm --filter @myk9/show typecheck
cd apps/myk9show && pnpm exec vitest run src/routes/routeRegistry.test.ts
```

- [ ] **Step 5: Commit PR 5**

Run:

```bash
git add docs/user-guides/workflow-source-map.md docs/training/screenshot-shot-list.md docs/audits/2026-06-28-overnight-launch-readiness-sweep.md apps/myk9show/src/routes/secretaryRoutes.tsx apps/myk9show/src/routes/routeRegistry.test.ts
git commit -m "docs(secretary): record canonical waitlist and volunteer surfaces"
```

Omit app files from `git add` if the task stays docs-only.

---

## Final Verification

- [ ] Run all checks from the completed task.
- [ ] Confirm every changed plan/audit doc has an accurate status line.
- [ ] Confirm no stale `secretary@myk9t.com`, `club@myk9t.com`, or deleted spec references remain in touched docs unless explicitly marked stale.
- [ ] Confirm the audit's **Recommended Next Work** section now distinguishes completed remediation from still-open product decisions.
- [ ] Run:

```bash
git status --short
git diff --check
```

Expected: only intentional files are changed before each commit; `git diff --check` passes.

## Self-Review

**Spec coverage:** This plan covers every high/medium finding in the overnight audit except broad file-size/churn cleanup, which is intentionally left out because it is not a launch blocker and would require a separate architecture plan.

**Placeholder scan:** No open-ended implementation placeholders are required for execution. The only decisions are scoped as explicit deliverables with concrete text to record.

**Type consistency:** Proposed TypeScript entries use existing route/component paths and `UserRole` values already used in the app. Implementers must verify `UserRole.CLUB_ADMIN` in `apps/myk9show/src/types/auth-types.ts` before editing `pageDirectory.ts`.
