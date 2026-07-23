## 1. Review-State Vocabulary Module

- [x] 1.1 Grep every render site of the current review-state strings ("Accepted", "Reviewed", "Needs review", "Missing Info", "Accept entry", "Reject entry", bulk labels) across `apps/myk9show/src/components/entries/**` and record the consumer list.
- [x] 1.2 Write assertion-first tests for a pure `reviewStateLabels` module: state→label/tone mapping, verb-command mapping for menu items, and a source-text pin that "Reviewed" is no longer produced.
- [x] 1.3 Implement the module and convert queue rows, `EntryFocusedRegistration.reviewLabel`, `EntryStatusPopover`, and bulk-action labels to consume it.
- [x] 1.4 Run colocated + caller tests for every converted component; `pnpm typecheck`.

## 2. Primary-Work Decision Actions

- [x] 2.1 Write failing component tests for `EntryFocusedRegistration`: Accept/Reject buttons render for needs-review registrations, call the same handlers as the overflow menu with the same entry ids, and do not render when no action is needed; "no action needed" copy renders for fully processed registrations; singular verb agreement.
- [x] 2.2 Implement the panel buttons and the no-action state, wiring the existing bulk/status handlers (no new mutation paths).
- [x] 2.3 Verify in-browser (dev server): accept from panel updates queue chips live; overflow menu still works.

## 3. Status Menu Marking and Revert Guard

- [x] 3.1 Write failing tests for `EntryStatusPopover`: current status marked and inert; choosing a pre-scoring status for a completed entry opens a confirmation; confirm applies, cancel is a no-op; non-scored entries change with no dialog; double-submit latch per project AlertDialog lesson.
- [x] 3.2 Implement current-state marking and the completed-entry confirmation dialog.
- [x] 3.3 Run popover + status-cell caller tests; `pnpm typecheck`.

## 4. Narrow Layout Pass

- [x] 4.1 Write viewport-conditional tests (or logic tests on the responsive state) for chip wrapping and stacked rows at the compact breakpoint; assert single-DOM-copy rows.
- [x] 4.2 Implement chip wrapping (density control at row end) and stacked row layout via the existing `entryManagementCockpitResponsive` state.
- [x] 4.3 Browser-verify at 390 px and 768 px (light + dark): chips reachable, names legible, tablet grid unchanged; capture screenshots for the PR.

## 5. Entries Tab Consolidation

- [x] 5.1 Confirm the manager-vs-anon audience split in `ShowDetailTabs`/`EntriesTab` and whether any other consumer imports `EntriesTab`.
- [x] 5.2 Write failing tests: manager sees summary counts + "Open Entry Management" navigation; anon/public rendering unchanged.
- [x] 5.3 Implement the manager summary + link (delete the manager table branch; keep or extract the public path per 5.1 findings).
- [x] 5.4 Grep docs (`--include="*.md"`) for references to the manager Entries tab table and update any user-guide/support text that describes it.

## 6. Verification and Closeout

- [x] 6.1 Run focused vitest suites for all touched areas plus `pnpm typecheck`; note any pre-existing hangs separately.
- [x] 6.2 Secretary browser walk on desktop + 390 px: queue triage → focused card accept/reject → status menu marking/guard → Entries tab link; record evidence.
- [x] 6.3 Run `pnpm openspec validate entry-cockpit-action-grammar --strict`.
- [x] 6.4 Open PR(s) referencing the audit doc, run Codex review before merge (behavior-changing), wait for CI, merge.
- [x] 6.5 Archive the change via the opsx archive flow only after merge and verification.
