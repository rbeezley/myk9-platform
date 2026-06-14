# Phase 4 Seam Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, write-safe Dynamic QA harness that lets Phase 4 cross-role seams be exercised end to end without mutating the shared Supabase project.

**Architecture:** Add a typed Playwright fixture that models one complete cross-role show and a route-interception layer that serves local fixture reads while capturing and applying writes in memory. Keep the app running normally through Vite and real authentication, but intercept Supabase REST, RPC, and edge-function writes for the seeded seam records before they can reach staging. Use existing E2E patterns from `src/test/e2e/show/atShowOfflineScoring.spec.ts` and `src/test/e2e/show/showConflictSurfacing.spec.ts`: typed helpers, `page.route`, real browser contexts, and direct IndexedDB inspection only where the replication layer is the behavior under test.

**Tech Stack:** TypeScript, Playwright, Vite dev server, `@playwright/test`, existing `TEST_USERS`, existing sign-in helpers, local in-memory fixture state.

---

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This exercises offline-sensitive cross-role entry, messaging, refund, waitlist, and results flows where accidental shared-system writes or inconsistent role state would create launch-critical risk.

## File Structure

- `apps/myk9show/src/test/e2e/fixtures/phase4SeamFixture.ts`
  - Typed local data for one seeded show, secretary user, exhibitor users, dogs, trials, classes, entries, payments/refunds, waitlist offers, message threads, and results.
- `apps/myk9show/src/test/e2e/fixtures/phase4SeamRoutes.ts`
  - Playwright route helpers that serve fixture-backed Supabase reads and intercept all fixture-related writes.
- `apps/myk9show/src/test/e2e/fixtures/phase4SeamRoutes.test.ts`
  - Unit tests for local fixture state transitions and shared-write blocking helpers.
- `apps/myk9show/src/test/e2e/show/phase4CrossRoleSeams.spec.ts`
  - Dynamic QA spec that walks the cross-role seams and records latency/evidence.
- `docs/audits/2026-06-ux-journeys/03-cross-role-seams.md`
  - Updated only after the spec proves the seams and screenshots are captured.

## Guardrails

- [ ] Do not create migrations, shared Supabase rows, shared storage objects, GitHub issues, or PR comments while implementing this plan.
- [ ] Do not let app-data `POST`, `PATCH`, `PUT`, `DELETE`, `/rpc/`, or `/functions/v1/` requests for fixture records pass through to Supabase.
- [ ] Fail the test if any non-auth app-data mutation is observed without an explicit fixture handler. Auth/session traffic may continue.
- [ ] If a required route cannot be intercepted robustly, stop and document the blocked endpoint in this plan before switching to a local Supabase seed strategy.
- [ ] Keep new E2E helpers TypeScript-only and scoped under `apps/myk9show/src/test/e2e/fixtures/`.
- [ ] Before updating UX audit findings, re-read `docs/INTENT.md` and preserve the secretary/show-day reliability prioritization from `docs/goals/fall-2026-launch-readiness.md`.

## Task 1: Inventory The Real Data Paths

- [ ] Search the app code for the endpoints and query helpers used by the five Phase 4 seams:
  - post-deadline pull/scratch or withdraw request
  - waitlist offer and acceptance
  - entry question and reply
  - withdrawal/refund status
  - results release visibility
- [ ] Record the exact tables, RPCs, and edge functions in the route helper comments.
- [ ] Confirm which reads are replication-backed and which reads use direct Supabase queries.
- [ ] Keep the inventory in code comments near the interceptors, not as a separate surface.

Suggested commands:

```bash
rg -n "scratch|withdraw|pull|waitlist|message|thread|refund|payment|result|release" apps/myk9show/src
rg -n "from\\('|rpc\\('|functions/v1|supabase\\.from|replicated.*Table" apps/myk9show/src
```

## Task 2: Create The Local Fixture Model

- [ ] Add `phase4SeamFixture.ts` with stable IDs prefixed by `phase4-`.
- [ ] Include one show that is past entry close, has class inventory, has one secretary, and has at least two exhibitors.
- [ ] Include entries in these starting states:
  - confirmed entry eligible for pull/scratch request
  - waitlisted entry with capacity pressure
  - confirmed entry with a question thread
  - withdrawn entry with payment/refund metadata
  - scored entry whose result is hidden until release
- [ ] Export a `createPhase4SeamState()` factory that returns a fresh mutable state object per test.
- [ ] Export read-only route constants for the app paths the spec will visit.

## Task 3: Add Write-Safe Route Interceptors

- [ ] Add `phase4SeamRoutes.ts` with `installPhase4SeamRoutes(page, state, options)`.
- [ ] Fulfill fixture-backed Supabase reads for only the seeded IDs and allow unrelated reads to continue.
- [ ] Intercept fixture-related writes and update the local state in memory:
  - entry scratch/pull request changes
  - waitlist offer and acceptance changes
  - message thread creation and reply changes
  - withdrawal/refund status changes
  - result release changes
- [ ] Fail fast with a 500 response when a fixture write payload is malformed or targets an unexpected row.
- [ ] Add a request audit array that records method, URL, payload, fulfilled status, and elapsed time.
- [ ] Add `assertNoSharedWrites(audit)` to fail if any fixture write was continued instead of fulfilled locally.
- [ ] Add `assertNoUnhandledAppDataMutations(audit)` to fail when a non-auth app-data mutation is neither fulfilled locally nor explicitly allowed.
- [ ] Do not use broad write blocking for auth/session endpoints; intercept only app data paths.
- [ ] Add route helper unit tests that prove malformed payloads return 500, expected payloads mutate local state, and unexpected app-data writes fail the audit.

## Task 4: Add Cross-Role Browser Setup

- [ ] Create two browser contexts in the spec: one secretary, one exhibitor.
- [ ] Create one shared `Phase4SeamState` instance per test so both browser contexts observe the same in-memory show state.
- [ ] Install route handlers on both pages before navigation, passing the shared state instance to each handler.
- [ ] Sign in with `signIn` and existing `TEST_USERS.SECRETARY` / `TEST_USERS.EXHIBITOR`.
- [ ] Navigate directly into the relevant role route with `returnTo` so the app mounts the intended surface immediately.
- [ ] Add helper assertions that wait for each page to show the seeded show name before taking seam actions.
- [ ] Add a per-test reset so retries and later tests never inherit mutated fixture state.

## Task 5: Exercise The Five Phase 4 Seams

- [ ] Post-deadline pull/scratch seam:
  - exhibitor requests pull/scratch from the existing entry surface
  - secretary sees the request in the existing secretary surface
  - secretary approves or acknowledges it
  - exhibitor sees the updated status without manual data editing
- [ ] Waitlist seam:
  - secretary offers an opening from the existing entry management or class roster surface
  - exhibitor sees the offer
  - exhibitor accepts it
  - both role views agree on entry status and class capacity
- [ ] Entry question seam:
  - exhibitor sends a question with `showId` context
  - secretary sees the message in the existing message center or show-scoped route
  - secretary replies
  - exhibitor sees the reply in the show-scoped thread
- [ ] Withdrawal/refund seam:
  - secretary marks refund or refund review state
  - secretary/accounting-facing view shows the same state
  - exhibitor entry status matches the refund state
- [ ] Results release seam:
  - secretary releases or publishes the seeded result
  - exhibitor sees the result only after release
  - the spec captures before/after assertions for hidden versus visible result state

For each seam, measure elapsed time from role A action to role B visible confirmation with `performance.now()`. Store those values in the test output attachment or console annotation so the audit can report them.

[EXPANDED] Treat a seam as failed when the receiving role does not show the expected state within 10 seconds. Record the timeout as evidence in the Playwright output instead of silently continuing to the next seam.

## Task 6: Capture Audit Evidence

- [ ] Save screenshots to `docs/audits/2026-06-ux-journeys/artifacts/` with names beginning `phase4-dynamic-`.
- [ ] Capture at least one screenshot per seam after the receiving role sees the state change.
- [ ] Keep screenshots deterministic by using the seeded fixture show and stable viewport.
- [ ] Update `03-cross-role-seams.md` only after the spec has run and the evidence files exist.
- [ ] Replace the current "requires approved seed mutation or local fixtures" caveat with the measured local fixture results.
- [ ] Score the completed seams against `docs/INTENT.md`, especially secretary/show-day trust and exhibitor reassurance.
- [ ] State the duplication question explicitly in the audit update: confirm each seam used an existing surface or deep link, and call out any accidental duplicate surface as a finding.

## Task 7: Testing Phase

- [ ] Run the fixture route unit tests:

```bash
pnpm --dir apps/myk9show exec vitest run src/test/e2e/fixtures/phase4SeamRoutes.test.ts
```

- [ ] Run the focused Dynamic QA spec:

```bash
pnpm --dir apps/myk9show test:e2e:clean src/test/e2e/show/phase4CrossRoleSeams.spec.ts --project=chromium --workers=1 --timeout=120000 --retries=0
```

- [ ] Run the app typecheck:

```bash
pnpm --dir apps/myk9show typecheck
```

- [ ] Run markdown and whitespace validation:

```bash
git diff --check
```

- [ ] If the Playwright run hangs for more than 60 seconds without useful progress, stop the run and document the hang, matching the repo testing guidance.

## Task 8: Review And Ship

- [ ] Confirm `git status --short` contains only the fixture helpers, the seam spec, the audit update, and screenshots.
- [ ] Confirm no migration, Supabase seed, or shared-system mutation files were created.
- [ ] Commit with a message like `test(ux): add phase 4 seam fixtures`.
- [ ] Open or update the Phase 4 PR only after explicit approval to push.

## Execution Options

1. Use `superpowers:subagent-driven-development` to implement the fixture model, interceptors, spec, and audit update as separate tracked tasks.
2. Use `superpowers:executing-plans` inline in the current thread when the implementation needs tight feedback on app routes or selector choices.
