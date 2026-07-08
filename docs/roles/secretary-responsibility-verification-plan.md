# Secretary Responsibility Verification Plan

**Date:** 2026-07-08
**Status:** Active verification/remediation plan for fall 2026 launch readiness.
**Source matrix:** [`secretary-responsibility-coverage.md`](secretary-responsibility-coverage.md)
**OpenSpec change:** `openspec/changes/secretary-responsibility-verification`

## Purpose

Verify every secretary responsibility line item against the actual codebase, current workflow evidence, and fall 2026 launch expectations. The goal is to separate five things that are easy to blur together:

- a responsibility exists in the real secretary role
- a route or report appears to cover it
- the workflow actually works end to end
- the workflow has test, print, offline, or rehearsal evidence
- any missing work has a focused remediation plan

This plan starts after the AKC Scent Work forms row 7 implementation work. AKC official PDF coverage is now implementation-complete enough to use as evidence, but launch verification still needs printed alignment, current-form comparison, and submission checks.

## Ground Rules

- Work from the existing secretary coverage matrix. Do not invent a second responsibility list.
- Verify code before changing status. A route name alone is not enough.
- Search for canonical surfaces first. If remediation would duplicate an existing page, prefer a link, deep link, or consolidation.
- Keep fall 2026 secretary/show-day reliability as the priority frame.
- Preserve offline-first behavior for show-day data paths.
- Each remediation slice must include tests or an explicit manual/rehearsal evidence gate.
- Update this plan and the source matrix when a row's status changes.

## Verification States

| State                | Meaning                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Not started          | Row has not been freshly checked against current code.                                                                 |
| Inventory complete   | Relevant routes, modules, reports, tests, and docs are identified.                                                     |
| Verified covered     | Workflow is covered and has enough evidence for launch readiness, subject to final real-user testing where applicable. |
| Verified partial     | Workflow exists but needs implementation, test, print, offline, or rehearsal work.                                     |
| Verified gap         | Fall-required responsibility has no adequate current implementation.                                                   |
| Deferred accepted    | Responsibility is real but explicitly outside fall 2026 scope.                                                         |
| Remediation planned  | A focused remediation plan/OpenSpec change exists for the gap or partial.                                              |
| Remediation complete | Implementation merged and evidence recorded.                                                                           |

## Evidence Standard

Every row should gather the strongest applicable evidence:

| Evidence type                   | Required when                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Code inventory                  | Always. List routes, components, hooks, services, reports, package modules, migrations, and tests.                    |
| Workflow walkthrough            | Any secretary-facing responsibility. Use seeded/demo data and record the exact path.                                  |
| Unit or integration tests       | Any code remediation touching components, hooks, utilities, reports, PDF filling, data transforms, or mutation flows. |
| E2E or browser/a11y check       | Any UX remediation where the secretary must navigate, decide, print, or recover under pressure.                       |
| Offline/reconnect rehearsal     | Show-day check-in, late entry, move-up, scratch, scoring, result intake, or recovery flows.                           |
| Print/PDF check                 | Reports, labels, catalogs, scoresheets, registry forms, and closeout packets.                                         |
| Registry/source check           | AKC, UKC, ASCA official forms, closeout packets, and submission requirements.                                         |
| Real-user or operator rehearsal | Rows already Green-gated-on-real-user-test or involving non-technical secretary confidence.                           |

## Row Audit Backlog

### S1. Show Setup

| Row  | Responsibility                                                                    | Starting status   | Verification focus                                                                   | Likely remediation decision                                                             |
| ---- | --------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| S1.1 | Create show shell with dates, location, entry window, fees, and registry context. | Covered           | Re-walk `/secretary/create-show/wizard`; confirm current tests and wizard evidence.  | Evidence refresh only unless wizard regression is found.                                |
| S1.2 | Configure AKC Scent Work, UKC Nose Work, and ASCA Scent Detection trials/classes. | Partially covered | Inspect registry/class config code and seeded walkthroughs for all three registries. | Registry-specific setup remediation if UKC/ASCA are weak.                               |
| S1.3 | Assign judges and balance workload.                                               | Partially covered | Verify judge assignment data model, wizard/setup surfaces, and workload visibility.  | Link or improve existing setup surface; no separate judge tool unless proven necessary. |
| S1.4 | Configure rings and run order.                                                    | Partially covered | Walk setup, reports, show map/workbench, and exhibitor visibility.                   | Deep-link or consolidate if run-order controls are split.                               |
| S1.5 | Clone/reuse a prior show.                                                         | Partially covered | Verify clone wizard behavior and tests after recent consolidation.                   | Evidence refresh, then mark covered if current path holds.                              |

### S2. Entry Intake And Payment

| Row  | Responsibility                                                    | Starting status   | Verification focus                                                            | Likely remediation decision                                        |
| ---- | ----------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| S2.1 | Review entries and decide accepted, waitlisted, or rejected.      | Covered           | Re-walk Entry Management decisions, message side effects, and tests.          | Evidence refresh.                                                  |
| S2.2 | Manage waitlists and promote entries.                             | Covered           | Verify canonical Entry Management waitlist path and notifications.            | Evidence refresh or messaging remediation.                         |
| S2.3 | Record paper/mail-in entries with checks.                         | Partially covered | Walk secretary add-entry with check payment and no online checkout.           | Remediate in existing Entry Management/Add Entry flow.             |
| S2.4 | Create/link dog and person records for paper entries.             | Partially covered | Verify canonical people/dog creation path from secretary entry flow.          | Link to existing creation surfaces; avoid duplicate people/dog UI. |
| S2.5 | Mark online payments as paid through Stripe without double-entry. | Partially covered | Verify Stripe fixtures and secretary payment state display.                   | Data/status display remediation if mismatch found.                 |
| S2.6 | Record check number, amount, refunds, and outstanding balances.   | Partially covered | Inventory payment fields, totals, refund status, and closeout reconciliation. | Likely financial reconciliation remediation.                       |

### S3. Exhibitor Communication

| Row  | Responsibility                                                     | Starting status   | Verification focus                                                       | Likely remediation decision                        |
| ---- | ------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| S3.1 | Send entry confirmations from a single place.                      | Partially covered | Verify Message Center, lifecycle email jobs, and entry decision prompts. | Use existing Message Center/Entry Management flow. |
| S3.2 | Notify waitlist, rejection, schedule changes, and general updates. | Partially covered | Walk targeted messages, batch messages, and announcement delivery.       | Messaging remediation only on canonical surfaces.  |
| S3.3 | Send urgent show-day announcements from show desk context.         | Partially covered | Verify Show Desk Quick Broadcast/Class Broadcast.                        | Existing Show Desk tool remediation if needed.     |
| S3.4 | Keep communication tied to the correct show.                       | Partially covered | Check show-scoped routes, message jobs, and cross-show safeguards.       | Scope/guardrail remediation if needed.             |

### S4. Pre-Show Preparation

| Row  | Responsibility                                                           | Starting status   | Verification focus                                                         | Likely remediation decision                                      |
| ---- | ------------------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| S4.1 | Confirm show readiness before entries close and show day.                | Partially covered | Inspect readiness chips/signals and whether they lead to fixable surfaces. | Improve existing workbench readiness links, not a new dashboard. |
| S4.2 | Publish run order, ring assignments, armbands, and schedule information. | Partially covered | Walk secretary publication to exhibitor view.                              | Deep-link existing reports/show detail surfaces.                 |
| S4.3 | Print scoresheets, check-in sheets, labels, catalogs, and materials.     | Partially covered | Inventory reports and run representative print/PDF checks.                 | Report/print remediation by artifact.                            |
| S4.4 | Maintain volunteer schedule alongside ring/run-order planning.           | Partially covered | Verify basic scheduling scope; confirm deferred attendance/reassignment.   | Basic-scope cleanup only.                                        |
| S4.5 | Prepare show access codes/passcodes for ringside staff.                  | Partially covered | Verify access code generation, display, and cold passcode sign-in.         | Passcode verification/remediation, no new identity surface.      |

### S5. Show-Day Desk Operations

| Row  | Responsibility                                                    | Starting status   | Verification focus                                                                         | Likely remediation decision                         |
| ---- | ----------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| S5.1 | Run check-in desk in myK9Show.                                    | Covered           | Rehearse check-in desk with offline/reconnect where applicable.                            | Evidence refresh.                                   |
| S5.2 | Handle no-shows, scratches, pulls, and absent entries.            | Partially covered | Verify lifecycle transitions, counts, undo/recovery, and exhibitor view.                   | Existing Show Desk/Entry lifecycle remediation.     |
| S5.3 | Process secretary-handled move-ups/class changes.                 | Partially covered | Walk transfer form helper plus authoritative move-up action, armband/capacity/rollback.    | Existing Show Desk move-up remediation.             |
| S5.4 | Add late/day-of entries and collect payment.                      | Partially covered | Coordinate with `offline-show-desk-late-entry`; verify local-first behavior.               | Continue existing OpenSpec change before new scope. |
| S5.5 | Keep counts, availability, and status accurate as changes happen. | Partially covered | Verify count/status derivation after check-in, scratches, move-ups, late entries, scoring. | Likely class status/count remediation.              |
| S5.6 | Coordinate judges, stewards, and hospitality.                     | Partially covered | Verify basic tools, volunteers, messages; confirm full workforce ops deferred.             | Basic coordination only.                            |

### S6. Scoring And Results Verification

| Row  | Responsibility                           | Starting status   | Verification focus                                                             | Likely remediation decision                      |
| ---- | ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| S6.1 | Enter paper scoresheet results.          | Partially covered | Walk Results Control class-by-class paper intake.                              | Results Control remediation if friction remains. |
| S6.2 | Verify ringside results against paper.   | Partially covered | Re-walk ringside scoring integration and paper comparison.                     | Existing Results Control/ringside remediation.   |
| S6.3 | Confirm placements and class completion. | Partially covered | Verify placement-completion evidence and class finalization states.            | Completion/status remediation if stale.          |
| S6.4 | Release results only when ready.         | Covered           | Refresh release-to-exhibitor proof.                                            | Evidence refresh.                                |
| S6.5 | Recover from scoring/result mistakes.    | Partially covered | Run wrong result, corrected placement, release state, exhibitor view scenario. | Mistake-recovery remediation.                    |

### S7. Reports And Registry Submission

| Row  | Responsibility                                                    | Starting status   | Verification focus                                                                                                                                                                                                                             | Likely remediation decision                                                                                                                                              |
| ---- | ----------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S7.1 | Generate required AKC Scent Work reports, forms, labels, and XML. | Partially covered | Use AKC forms coverage doc and registry closeout verification as implementation evidence; launch-verify PDFs, XML recipient, print output.                                                                                                     | Implementation row 7 is done; remaining work is launch evidence and recipient confirmation.                                                                              |
| S7.2 | Generate required UKC Nose Work closeout materials.               | Partially covered | Use registry closeout verification evidence plus UKC closeout packet implementation: Trial Report, Entry, Change Entry, static judges books, and static trial score sheet actions are wired/tested; print and submission evidence remain open. | Add UKC submission guidance and packet preservation steps, then run representative print/PDF checks.                                                                     |
| S7.3 | Generate required ASCA Scent Detection closeout materials.        | Partially covered | Use registry closeout verification evidence plus ASCA closeout packet implementation: Entry Form, Trial Report, Trial Roster, and Score Sheet static official PDF downloads are wired; Gross Receipts and Post-Event Evaluation safe fills are wired/tested. | Verify current official ASCA source files, decide whether Secretary Checklist/Judge Conduct Evaluation belong in the packet, and run representative print/PDF checks. |
| S7.4 | Print reports/forms on representative venue hardware.             | Partially covered | Run venue printer, label printer, margin/scaling, and packet checks.                                                                                                                                                                           | Print remediation by affected artifact.                                                                                                                                  |
| S7.5 | Submit electronic registry results and preserve club artifacts.   | Partially covered | Use registry closeout verification evidence: AKC XML exists; Submit Results now adds UKC/ASCA manual submission guidance, official links, UKC Reports deep-linking, and manual submission history records.                                     | Verify AKC recipient and run representative UKC/ASCA packet preservation plus print/artifact evidence without inventing unsupported XML paths.                   |

### S8. Financial Reconciliation And Closeout

| Row  | Responsibility                                                     | Starting status   | Verification focus                                                          | Likely remediation decision                                     |
| ---- | ------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| S8.1 | Verify every accepted entry has a clear payment state.             | Partially covered | Walk totals/outstanding balances across accepted entries.                   | Reconciliation report or existing Entry Management enhancement. |
| S8.2 | Verify refunds and withdrawn/scratched entries agree across views. | Partially covered | Refresh secretary/exhibitor agreement after recent payment work.            | Payment status remediation if mismatch found.                   |
| S8.3 | Produce show-level financial totals for the club.                  | Gap               | Search reports/Entry Management for totals and exportable evidence.         | Likely focused financial totals remediation.                    |
| S8.4 | Submit results, distribute reports, archive/close show.            | Partially covered | Verify current closeout action, archive semantics, and report distribution. | Closeout workflow remediation if absent.                        |
| S8.5 | Manage Stripe payouts and club treasury operations.                | Deferred          | Confirm out-of-scope remains correct.                                       | Deferred accepted.                                              |

### S9. Exceptions And Recovery

| Row  | Responsibility                                                                                   | Starting status   | Verification focus                                            | Likely remediation decision                |
| ---- | ------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------- | ------------------------------------------ |
| S9.1 | Keep the show running with unreliable internet.                                                  | Partially covered | Full secretary/ringside offline-to-reconnect rehearsal.       | Offline remediation by failing flow.       |
| S9.2 | Recover check-in, scratch, move-up, late-entry, scoring, and result-intake work after reconnect. | Partially covered | Verify queued mutations, conflicts, and user-facing recovery. | Replication/show-day remediation.          |
| S9.3 | Avoid duplicate/conflicting implementations for same secretary job.                              | Partially covered | Search for duplicate pages/actions before each remediation.   | Consolidation/removal/linking remediation. |
| S9.4 | Recover mistaken entry status, payment, or result changes without developer help.                | Partially covered | Run role-level mistake recovery scenarios.                    | Existing lifecycle/recovery remediation.   |
| S9.5 | Support multiple secretaries collaborating on same show.                                         | Deferred          | Confirm post-fall decision still holds.                       | Deferred accepted.                         |

## Execution Phases

### Phase 0: Normalize Tracking

- Add row IDs from this plan to `secretary-responsibility-coverage.md` if useful after review.
- Create a row evidence note template for future updates.
- Confirm current AKC row 7 outcome is represented as implementation evidence, not a fully closed launch gate.

### Phase 1: Code Inventory Sweep

- For each row, record routes, components, hooks, services, reports, tests, migrations, packages, and docs.
- Use `rg` searches by responsibility terms and route names.
- Record whether data reads/writes use offline-safe replicated paths for show-day flows.
- Mark rows `Inventory complete` only after code and test locations are listed.

### Phase 2: Workflow Verification Sweep

- Walk secretary workflows in seeded/demo shows.
- Capture screenshot/manual notes only where they prove a decision or print result.
- Run focused unit tests for report/data/helper evidence where available.
- Run browser or E2E checks for secretary navigation and recovery flows where risk warrants it.
- Run printer/PDF checks for all report/form rows.
- Run offline/reconnect rehearsals for show-day operations and recovery rows.

### Phase 3: Remediation Planning

- Convert verified gaps/partials into small remediation slices.
- Prefer existing OpenSpec changes when one already exists, such as `offline-show-desk-late-entry`.
- For each slice, answer: "Does this duplicate an existing page? If so, why is duplication justified instead of a link?"
- Create one focused plan/OpenSpec change per coherent cluster, such as UKC closeout, ASCA closeout, show-level financial totals, or offline recovery.

### Phase 4: Implementation And Testing

- Implement remediation slices one small PR at a time.
- Add or update unit tests for new helpers, reports, hooks, and data transforms.
- Add workflow/browser/E2E checks for secretary UX changes where practical.
- Re-run relevant print/PDF or offline/reconnect evidence before marking the row remediation complete.
- Update this plan, the source matrix, and `OPEN-TODOS.md` after each merged slice.

## Suggested First Batches

1. **Registry closeout batch:** S7.2, S7.3, S7.5. Inventory UKC and ASCA requirements, then compare to existing report/submission infrastructure.
2. **Financial closeout batch:** S2.6, S8.1, S8.3, S8.4. Verify payment states, balances, refunds, and club totals.
3. **Show-day recovery batch:** S5.2, S5.3, S5.5, S9.1, S9.2, S9.4. Rehearse lifecycle changes, offline/reconnect, counts, and mistake recovery.
4. **Messaging confidence batch:** S3.1, S3.2, S3.3, S3.4. Verify show-scoped lifecycle emails, targeted messages, and urgent announcements.
5. **Print evidence batch:** S4.3, S7.1, S7.4. Print the AKC packet, scoresheets, labels, catalogs, and check-in materials on representative hardware.

## Completion Criteria

The broader secretary responsibility verification effort is complete when:

- every row is at least `Inventory complete`
- every fall-required row is `Verified covered`, `Verified partial`, or `Verified gap`
- every `Verified partial` and `Verified gap` has a remediation plan or explicit accepted deferral
- every implementation remediation has tests or a documented manual/rehearsal gate
- `secretary-responsibility-coverage.md` reflects the verified state
- launch-blocking rows are represented in `OPEN-TODOS.md` or a linked active plan
