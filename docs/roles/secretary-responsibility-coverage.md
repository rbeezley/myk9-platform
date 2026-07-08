# Secretary Responsibility Coverage

## Purpose

This document maps the real-world responsibilities of the show/trial secretary to
myK9 coverage for fall 2026 launch readiness.

It is a best-current-evidence snapshot, seeded from:

- [`docs/roles/secretary.md`](secretary.md)
- [`docs/journeys/secretary.md`](../journeys/secretary.md)
- [`docs/user-guides/workflow-source-map.md`](../user-guides/workflow-source-map.md)
- [`docs/goals/fall-2026-launch-readiness-scorecard.md`](../goals/fall-2026-launch-readiness-scorecard.md)

It is not a fresh code audit. Rows that need a new walkthrough, print test,
rulebook check, or real-user validation say so in the evidence column.

## Scope

**In scope:** the show/trial secretary accountable for running a specific show
end to end.

**Out of scope:** club administration, Stripe payout operations, treasurer
bookkeeping, site-admin support, and post-fall self-service workflows.

## Status Labels

| Status            | Meaning                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Covered           | myK9 has an identified surface for the responsibility, with current evidence that the workflow works.   |
| Partially covered | myK9 has some coverage, but the workflow is incomplete, weakly verified, or depends on manual fallback. |
| Gap               | The responsibility is fall-required and no adequate myK9 coverage is identified yet.                    |
| Deferred          | The responsibility is real, but explicitly out of fall 2026 scope.                                      |

## Coverage Matrix

### 1. Show Setup

| Responsibility                                                                            | Fall scope                                         | Current myK9 coverage                                                         | Status            | Evidence / verification needed                                                                                                                              |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create the show shell with dates, location, entry window, fees, and registry context.     | Required                                           | `/secretary/create-show/wizard`                                               | Covered           | Secretary journey Phase 1 and workflow source map section 12. Keep verifying through golden-path walks.                                                     |
| Configure trials and classes for AKC Scent Work, UKC Nose Work, and ASCA Scent Detection. | Required                                           | Show creation wizard plus `/shows/:showId/setup`                              | Partially covered | Scorecard scopes all three registries, but per-registry setup coverage needs current walkthrough evidence.                                                  |
| Assign judges to classes and balance judge workload.                                      | Required                                           | Wizard class selection and setup surfaces                                     | Partially covered | Role doc requires judge assignment; scorecard says secretary golden path is Green-gated-on-real-user-test. Need per-registry judge assignment verification. |
| Configure rings and run order so exhibitors and stewards know where to be.                | Required                                           | `/shows/:showId/setup`, `/shows/:showId/reports`, and show workbench surfaces | Partially covered | Workflow source map covers setup and reports; run-order proof should be refreshed in show-day rehearsal.                                                    |
| Clone or reuse a prior show to reduce setup burden.                                       | Required for launch quality, not strict compliance | Existing clone-show plans/specs                                               | Partially covered | Use existing clone-show consolidation docs as evidence; verify current route behavior before marking Covered.                                               |

### 2. Entry Intake And Payment

| Responsibility                                                                               | Fall scope | Current myK9 coverage                                                  | Status            | Evidence / verification needed                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review each submitted entry and decide accepted, waitlisted, or rejected.                    | Required   | `/shows/:showId/entry-management`                                      | Covered           | Workflow source map section 15; secretary journey Phase 2; scorecard Green-gated-on-real-user-test.                                                        |
| Manage waitlists and promote entries when space opens.                                       | Required   | Entry Management owns waitlist work                                    | Covered           | Workflow source map canonical surface decision: waitlist belongs in Entry Management. Needs continued golden-path evidence.                                |
| Record paper/mail-in entries that arrive with checks.                                        | Required   | Entry Management Add Entry flow                                        | Partially covered | User decision: required. Secretary journey says mail-in check recording is live. Needs current walkthrough with new dog/person creation and payment state. |
| Create or link dog and person records when a paper entry references someone not yet in myK9. | Required   | Entry Management Add Entry flow plus People/Dogs records               | Partially covered | Secretary checklist covers people/dog setup; need walkthrough that one entry path leads to the same canonical creation flow.                               |
| Mark online payments as paid through Stripe without secretary double-entry.                  | Required   | Online registration and Stripe checkout feed payment status downstream | Partially covered | Role doc says online entries auto-mark paid. Needs payment fixture verification for the secretary view.                                                    |
| Record check number, amount paid, refunds, and outstanding balances for mail-in entries.     | Required   | Entry Management payment fields; refund status surfaces                | Partially covered | Required by user decision. Current docs mention check number and amount paid; reconciliation totals need verification.                                     |

### 3. Exhibitor Communication

| Responsibility                                                                   | Fall scope | Current myK9 coverage                                     | Status            | Evidence / verification needed                                                                                         |
| -------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Send entry confirmations from a single place.                                    | Required   | `/secretary/messages` and registration email function     | Partially covered | Secretary journey says outbound email is active development/scaffolded in places. Verify current state before Covered. |
| Notify exhibitors of waitlist, rejection, schedule changes, and general updates. | Required   | `/secretary/messages`; announcements from show desk tools | Partially covered | Workflow source map section 16. Needs end-to-end proof that targeted messages and announcements reach exhibitors.      |
| Send urgent show-day announcements without leaving the show-desk context.        | Required   | Show Desk Quick Broadcast / Class Broadcast tools         | Partially covered | Secretary checklist lists these tools. Needs live show-day rehearsal evidence.                                         |
| Keep secretary/exhibitor communication tied to the correct show.                 | Required   | Message Center and show-scoped routes                     | Partially covered | Workflow source map section 16; cross-role seam audit should be refreshed after final messaging work.                  |

### 4. Pre-Show Preparation

| Responsibility                                                                              | Fall scope                        | Current myK9 coverage                                               | Status            | Evidence / verification needed                                                                                     |
| ------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Confirm the show is ready before entries close and before show day.                         | Required                          | Show workbench readiness signals                                    | Partially covered | INTENT.md calls for green-check clarity; verify current readiness chips land on fixable surfaces.                  |
| Publish or provide run order, ring assignments, armbands, and schedule information.         | Required                          | `/shows/:showId/reports`, show detail pages, setup/workbench routes | Partially covered | Needs current walkthrough from secretary publication to exhibitor view.                                            |
| Print scoresheets, check-in sheets, armband labels, catalogs, and other pre-show materials. | Required                          | `/shows/:showId/reports`                                            | Partially covered | Scorecard says reports render, but print testing on representative hardware remains open.                          |
| Maintain a volunteer schedule and reference it alongside ring/run-order planning.           | Partial/deferred                  | `/secretary/volunteers`                                             | Partially covered | User decision: basic scheduling is fall scope; real-time attendance/reassignment deferred.                         |
| Prepare show access codes/passcodes for ringside staff.                                     | Required for show-day reliability | Show Desk tools panel / Show Access Codes                           | Partially covered | Secretary checklist includes access code verification. Needs show-day rehearsal evidence for judge/steward access. |

### 5. Show-Day Desk Operations

| Responsibility                                                          | Fall scope                                               | Current myK9 coverage                                      | Status            | Evidence / verification needed                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Run the check-in desk in myK9Show without switching apps.               | Required                                                 | `/shows/:showId/show-desk`                                 | Covered           | Role doc says check-in desk lives in myK9Show; workflow source map section 17. Needs continued show-day rehearsal evidence. |
| Handle no-shows, scratches, pulls, and absent entries quickly.          | Required                                                 | Show Desk entry actions and entry lifecycle transitions    | Partially covered | Scorecard says secretary half coherent; open show-day reliability items remain. Re-walk needed.                             |
| Process move-ups and class changes manually for fall.                   | Required                                                 | Show Desk move-up action; Entry lifecycle `markEntryMoved` | Partially covered | User decision: secretary-handled for fall. Needs current walkthrough for armband carryover, capacity, and rollback.         |
| Add late/day-of entries and collect payment.                            | Required                                                 | Show Desk Late Entry action                                | Partially covered | Late-entry design exists; needs offline-safe and payment-state verification.                                                |
| Keep class counts, availability, and status accurate as changes happen. | Required                                                 | Show Desk / class status surfaces                          | Partially covered | Scorecard notes remaining S4/S5 show-day count/status findings. Keep Yellow until resolved or accepted.                     |
| Coordinate with judges, stewards, and hospitality during the show.      | Basic coordination required, full workforce ops deferred | Show Desk tools, Volunteers, announcements                 | Partially covered | Basic communication/scheduling only. Real-time volunteer attendance/reassignment is Deferred.                               |

### 6. Scoring And Results Verification

| Responsibility                                                                   | Fall scope | Current myK9 coverage                                      | Status            | Evidence / verification needed                                                                              |
| -------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Enter results from paper scoresheets when ringside scoring is not used.          | Required   | `/shows/:showId/results-control`                           | Partially covered | Secretary journey Phase 3 and 4. Needs current class-by-class paper-score workflow verification.            |
| Verify electronic/ringside results against paper scoresheets when myK9Q is used. | Required   | Results Control plus ringside scoring integration          | Partially covered | Scorecard says ringside judge/steward phases need full re-walk.                                             |
| Confirm placements and class completion before releasing results.                | Required   | `/shows/:showId/results-control`                           | Partially covered | Scorecard identifies placement-completion evidence, but show-day reliability remains Yellow.                |
| Release results to exhibitors only when ready.                                   | Required   | Results Control release action and exhibitor result routes | Covered           | Scorecard says exhibitor result visibility passed post-remediation; final real-user test remains.           |
| Recover calmly from scoring/result mistakes.                                     | Required   | Existing result editing/release controls where present     | Partially covered | Needs explicit mistake-recovery scenario: wrong result, corrected placement, release state, exhibitor view. |

### 7. Reports And Registry Submission

| Responsibility                                                                                                    | Fall scope | Current myK9 coverage                                        | Status            | Evidence / verification needed                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generate required AKC Scent Work reports, catalogs, judge reports, secretary reports, labels, and XML submission. | Required   | `/shows/:showId/reports` and `/shows/:showId/submit-results` | Partially covered | AKC official PDFs for entry forms, score sheets, transfer forms, judge/secretary/chair reports, and certification are wired or partially wired as documented; XML submission exists but launch verification remains. See [`secretary-akc-scent-work-official-forms-coverage.md`](secretary-akc-scent-work-official-forms-coverage.md) and [`secretary-registry-closeout-verification.md`](secretary-registry-closeout-verification.md). |
| Generate required UKC Nose Work closeout materials.                                                               | Required   | Reports infrastructure plus UKC official PDF packet actions  | Partially covered | UKC Trial Report, Entry, and Change Entry fills are wired and tested. Element Judges Book, Handler Discrimination Judges Book, and Trial Score Sheet official PDFs are registered as static packet downloads. UKC submission guidance and representative print evidence remain open. See [`secretary-registry-closeout-verification.md`](secretary-registry-closeout-verification.md).                                                  |
| Generate required ASCA Scent Detection closeout materials.                                                        | Required   | Local ASCA source PDFs only                                  | Gap               | ASCA source PDFs are present, but ASCA official PDF templates and Reports-page actions are not wired. Needs ASCA closeout packet remediation through existing Reports/Submit Results surfaces. See [`secretary-registry-closeout-verification.md`](secretary-registry-closeout-verification.md).                                                                                                                                        |
| Print reports/forms on representative venue hardware.                                                             | Required   | Browser/PDF print flows                                      | Partially covered | Scorecard explicitly leaves venue printer, label printer, and margin/scaling verification open.                                                                                                                                                                                                                                                                                                                                         |
| Submit electronic registry results and preserve the artifacts needed for the club.                                | Required   | Submit Results route; manual email for AKC XML               | Partially covered | AKC XML exists but recipient verification remains open. ASCA has an official online results/payment upload path; UKC needs confirmed paperwork/manual submission guidance and packet preservation. See [`secretary-registry-closeout-verification.md`](secretary-registry-closeout-verification.md).                                                                                                                                    |

### 8. Financial Reconciliation And Closeout

| Responsibility                                                                             | Fall scope             | Current myK9 coverage                                 | Status            | Evidence / verification needed                                                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Verify every accepted entry has a clear payment state before closeout.                     | Required               | Entry Management payment/status data                  | Partially covered | User decision: secretary-level reconciliation required. Need totals and outstanding-balance walkthrough.             |
| Verify refunds and withdrawn/scratched entries agree across secretary and exhibitor views. | Required               | Entry Management and exhibitor entry/payment surfaces | Partially covered | Scorecard says refund/withdrawn cross-role agreement passed live on 2026-06-18; refresh if related surfaces changed. |
| Produce show-level financial totals for the club.                                          | Required               | Reports / Entry Management data                       | Gap               | Role doc requires financials; current evidence says no dedicated reconciliation report or totals view.               |
| Submit results, distribute reports, and archive/close out the show.                        | Required               | Reports, Submit Results, closeout action planned      | Partially covered | Secretary journey says Close Out Show was not yet built in that snapshot. Verify current state before status update. |
| Manage Stripe payouts and club treasury operations.                                        | Out of secretary scope | Club Admin / treasurer lane                           | Deferred          | User decision: outside this secretary doc except for show-level reconciliation.                                      |

### 9. Exceptions And Recovery

| Responsibility                                                                                   | Fall scope | Current myK9 coverage                                                  | Status            | Evidence / verification needed                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Keep the show running when venue internet is unreliable.                                         | Required   | Offline-first replicated data paths for core show-day flows            | Partially covered | User decision: both secretary duty and platform requirement. Scorecard says full offline/reconnect rehearsal is still missing. |
| Recover check-in, scratch, move-up, late-entry, scoring, and result-intake work after reconnect. | Required   | Replication queue/conflict machinery and show-day surfaces             | Partially covered | Strong unit/code evidence exists, but live offline-to-reconnect secretary rehearsal remains open.                              |
| Avoid duplicate or conflicting implementations for the same secretary job.                       | Required   | Workflow source map canonical routes                                   | Partially covered | Source map identifies canonical routes. Continue enforcing consolidate-don't-duplicate before new UX work.                     |
| Recover from mistaken entry status, payment, or result changes without developer help.           | Required   | Entry lifecycle rollback/restore functions; admin support where needed | Partially covered | Needs role-level mistake recovery walkthrough, not just code evidence.                                                         |
| Support multiple secretaries collaborating on the same show.                                     | Post-fall  | Not fall scope                                                         | Deferred          | Existing role doc defers multi-secretary collaboration.                                                                        |

## Launch-Risk Summary

### Highest-Risk Required Gaps

| Gap                                     | Why it matters                                                                         | Next evidence needed                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| UKC and ASCA registry closeout coverage | Fall scope explicitly includes AKC, UKC, and ASCA scent workflows.                     | Build a registry-by-registry report/form/submission inventory and walk each path.                                         |
| Show-level financial totals             | The secretary must reconcile entries, payments, refunds, and balances before closeout. | Verify whether current Reports or Entry Management can produce the needed totals; otherwise add a focused backlog item.   |
| Offline/reconnect rehearsal             | Venue internet failure is a realistic show-day condition.                              | Run a full secretary/ringside offline-to-reconnect rehearsal with check-in, scratches, move-ups, late entry, and results. |

### Partials To Re-Verify Before Launch

- Mail-in paper entry with new dog/person creation and check payment.
- Targeted outbound messages, waitlist notices, rejection notices, and schedule-change alerts.
- Report printing on representative venue hardware.
- Secretary-handled scratches, move-ups, withdrawals, and refunds across both secretary and exhibitor views.
- Close Out Show behavior and archive/cascade semantics.

## Maintenance Rules

- Keep responsibilities phrased as real-world obligations, not app features.
- Add or update rows when the secretary role doc, workflow source map, or launch scorecard changes.
- Do not mark a row Covered because a route exists. Covered requires a route plus evidence that the workflow works.
- If a row is a Gap or risky Partial, link it to `OPEN-TODOS.md`, an existing plan, or a new focused plan before implementation begins.
