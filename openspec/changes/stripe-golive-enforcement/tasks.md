## 1. Baseline And Contract Pinning

- [x] 1.1 Inventory the latest deployed-source definitions and current callers for
      `submit_show_entries`, `create_online_paid_entry`, judge-day capacity, waitlist promotion,
      `stripe-payment-link`, webhook reconciliation, waitlist expiration, My Entries waitlist data,
      and push dispatch; record any drift from `docs/plan-stripe-golive-enforcement.md` in the design.
- [x] 1.2 Add assertion-first failing source/unit tests for the shared class/judge advisory-lock
      contract, class maximum, duplicate waitlist idempotency, source authorization matrix, mixed
      outcome strings, legacy response compatibility, and created-only payment/armband follow-up; run
      them red before implementation.
- [x] 1.3 Confirm generated schema property/function names before TypeScript edits and record the
      migration version chosen after checking all current migration filenames.

## 2. Phase A — Shared Capacity Enforcement

- [x] 2.1 Add the migration with one shared SECURITY DEFINER class-plus-judge capacity decision,
      exact existing advisory-lock identities, deterministic lock order, class-limit and duplicate
      waitlist handling, source-aware reserve behavior, explicit show-desk override, narrow grants,
      comments, and rollback SQL.
- [x] 2.2 Repoint `create_online_paid_entry` to the shared decision while preserving its external
      return strings, paid-entry insert, waitlist idempotency, and service-role-only contract.
- [x] 2.3 Extend the latest five-argument `submit_show_entries` body to validate per-entry
      `submission_source`, return created/waitlisted/denied outcomes, preserve created-only legacy
      `entries`, insert idempotent waitlist rows, and persist the entire result in `entry_submissions`.
- [x] 2.4 Update `submitShowEntries` and registration orchestration to send the verified source,
      tolerate legacy responses, calculate payment/armband follow-up from created outcomes only, and
      present waitlisted/denied confirmation state without adding a new surface.
- [x] 2.5 Add focused TypeScript and migration-source tests for self-service reserve, organizer
      physical capacity, unauthorized source, official override, mixed outcomes, idempotent retries,
      fee totals, armband inputs, and legacy response mapping; make the assertion-first tests green.
- [x] 2.6 Run a rolled-back database behavior matrix and two-transaction last-spot concurrency probe,
      plus representative multi-entry query-plan/timing evidence, when a local or approved remote
      database is available; otherwise record the exact blocked command and source-only evidence
      without marking this task complete.
- [x] 2.7 Run focused Phase A tests, `pnpm typecheck`, `pnpm lint`, and the app suite; complete the
      required database/security second-opinion review and fix findings.
- [x] 2.8 Commit Phase A, prepare its PR body with `Tracked in openspec change:
stripe-golive-enforcement`, and stop for confirmation before PR creation, migration push, or merge.

## 3. Phase C — Waitlist Notification Dispatch

- [x] 3.1 Add assertion-first failing tests for offer-source parity, dedicated-secret fail-closed
      behavior, payload validation, deep-link destination, push recipient scoping, and per-event
      idempotency.
- [x] 3.2 Add the durable offer-cycle notification event ledger with unique key, retry state,
      attempts/redacted failure metadata, indexes, comments, narrow grants, trigger wiring, and rollback
      SQL.
- [x] 3.3 Implement the secret-authenticated waitlist notification dispatcher using existing
      email and Web Push patterns, My Entries deep links, chunked subscription reads, expired
      subscription cleanup, and no service-role-secret fallback.
- [x] 3.4 Make every committed `offered` transition invoke the dispatcher; remove cron's direct
      offer-email duplication only after the trigger path exists.
- [x] 3.5 Extend the waitlist cron to claim/send exactly one halfway reminder and expiry notice,
      skip paid/reconciling/mail-in rows correctly, and retain non-blocking delivery failure evidence.
- [x] 3.6 Add focused Edge/shared-helper/migration tests and make the assertion-first tests green.
- [x] 3.7 Run focused Phase C tests, `pnpm typecheck`, `pnpm lint`, and the app suite; complete the
      required security/database second-opinion review and fix findings.
- [x] 3.8 Commit Phase C, prepare its PR body, and stop for confirmation before PR creation,
      migration push, function deployment, secret mutation, smoke writes, or merge.

## 4. Phase B — In-Place Offer Payment And Decline

- [x] 4.1 Add assertion-first failing tests for offer-owner payment authorization, mixed/non-owner
      rejection, ordinary-unpaid-entry rejection, expired offer handling, and preserved organizer/
      internal authorization.
- [x] 4.2 Extend `stripe-payment-link` with the narrow offer-owner path while preserving
      authoritative pricing, Connect readiness, redirect allowlisting, open-link replacement,
      persisted-link failure handling, and webhook reconciliation.
- [x] 4.3 Implement `decline-waitlist-offer` with authenticated ownership checks, shared expiry/
      Stripe-session coordination, paid-session conflict handling, idempotent terminal behavior, and
      existing cascade compatibility.
- [x] 4.4 Extend the existing My Entries waitlist query/model with promoted entry and offer timing
      needed for actions; keep reads scoped to the authenticated exhibitor.
- [x] 4.5 Add Complete payment, Decline, countdown, expired/reconciled, retry, and deep-link focus
      behavior to `WaitListSection` using plain language and minimum 44px controls; do not add a route
      or payment page.
- [x] 4.6 Add focused component/hook/function/shared-helper tests covering desktop/mobile content,
      keyboard/touch targets, transient failure recovery, link refresh, decline, and payment races;
      make assertion-first tests green.
- [x] 4.7 Run focused Phase B tests, `pnpm typecheck`, `pnpm lint`, and the app suite; complete the
      required payment/security second-opinion review and fix findings.
      Focused suite (31 tests), typecheck, lint, and two clean independent reviews completed. The
      full app-suite command was attempted twice but the local runner stopped reporting immediately
      after Vitest started; treat its result as inconclusive and require CI confirmation before merge.
- [x] 4.8 Commit Phase B, prepare its PR body, and stop for confirmation before PR creation,
      function deployment, Stripe test-mode smoke writes, or merge.

## 5. Integrated Verification

- [ ] 5.1 Run `pnpm openspec validate --change stripe-golive-enforcement`, implementation
      verification, duplicate-surface search, migration version/rollback/grant checks, and generated
      Supabase type verification.
- [ ] 5.2 Run the relevant E2E/phase-4 seam flow for promote → notify → pay and promote → decline/
      expire → cascade, plus mobile My Entries replay; stop any runner that hangs beyond 60 seconds and
      record the limitation.
- [x] 5.3 After explicit approval, dry-run/push migrations, deploy changed/new Edge Functions with
      required flags, and capture redacted staging auth/failure-path evidence without live-mode money.
      2026-07-13: dry run identified only `20260713110000_waitlist_offer_payment_guard.sql`; it
      was applied and a follow-up dry run reported the remote database up to date. `stripe-payment-link`
      deployed ACTIVE v12 at 15:12:02 UTC and `decline-waitlist-offer` ACTIVE v1 at 15:12:16 UTC.
      Both endpoints returned 401 to an unauthenticated no-op POST, with no Stripe or waitlist write.
- [x] 5.4 After explicit approval, run a Stripe test-mode low-value promotion payment and decline/
      expiry smoke; confirm entry, waitlist, link, webhook, refund-safety, and capacity states.
      2026-07-13 controlled E2E-exhibitor smoke: a `cs_test_` $32.10 Checkout payment reconciled
      one $30.00 promoted entry to `confirmed`/`paid`/`online`, its link to `paid`, offer to
      `accepted`, and one succeeded entry order. A second controlled `cs_test_` offer was declined:
      its link is `expired`, offer `declined`, entry `promotion-expired`/pending with no payment
      intent, and zero orders. Judge-day availability changed 121→120 only for the paid entry.

## 6. Tracking And Delivery

- [ ] 6.1 Update `OPEN-TODOS.md`, `docs/plan-stripe-golive-enforcement.md`, the go-live runbook,
      launch scorecard, and any affected API/operations docs with actual implementation and evidence;
      remove or correct the stale standalone AcroForm todo only if verified in the same diff.
- [ ] 6.2 Run `git diff --check`, focused checks, full validation required by the high-risk profile,
      and `openspec-verify-change`; fix CRITICAL and straightforward WARNING findings.
- [ ] 6.3 After explicit approval, create the required PR(s), wait for CI/review, address failures,
      and merge each phase; do not treat an open PR as completion.

## 7. Sync, Archive, And Cleanup

- [ ] 7.1 After every required PR is proven merged and approved staging evidence is recorded, sync
      the four delta specs to `openspec/specs/` and archive `stripe-golive-enforcement` with PR evidence.
- [ ] 7.2 Confirm before any archive commit/push to `main`, then sync `main`, prune refs, delete the
      feature branch, and remove this worktree as the final cleanup command.
