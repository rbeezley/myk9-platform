## 1. Show Registration projection and queue logic

- [x] 1.1 Add assertion-first tests for registration/payment-intent/single-Entry grouping, multi-Dog registrations, and per-Entry Handler preservation.
- [x] 1.2 Implement the typed Show Registration projection by reusing existing enrollment payment helpers and canonical Entry attention predicates.
- [x] 1.3 Add tests proving Needs review, Missing information, Payment due, and All counts equal their visible Show Registration result sets and preserve oldest-first work ordering.
- [x] 1.4 Implement group queue selectors, recommended next-action metadata, and 50-registration pagination helpers without a hidden urgency formula.
- [x] 1.5 Add tests for whole-show search across Exhibitor/email, Dog, per-Entry Handler, Armband, confirmation, Entry number, and Class, including matching-child context.
- [x] 1.6 Add tests that filtering/sorting precedes pagination and that page, focus, and compatible selection survive detail open/close.

## 2. URL, scope, and responsive state

- [x] 2.1 Add table-driven tests for the canonical queue/search/registration URL contract and every supported legacy attention, payment, mode, view, entryTab, tab, exception, and child-entry focus normalization.
- [x] 2.2 Refactor Entry Management URL state so Needs review is the default, search temporarily ignores dormant queue/scope, clearing search restores them, and invalid/cross-show focus is removed.
- [x] 2.3 Add tests for browser-addressable focus, Back/Forward-safe writers, copied normalized links, and selection clearing on queue/scope changes.
- [x] 2.4 Extract and test a content-width responsive controller that preserves focused detail when a wide layout narrows and returns to the preserved queue on Back.

## 3. Production queue and focused pane

- [x] 3.1 Build the compact queue selector, robust search, Trial/Class scope controls, and accessible Show Registration header/rows from production data.
- [x] 3.2 Keep `Add entry` as the only visible primary page action and move copy-link, export, and density into compact labeled secondary controls.
- [x] 3.3 Add persistent focus feedback (background, inset outline, leading accent, and accessible selected state) distinct from checkbox selection in light and dark themes.
- [x] 3.4 Build one responsive focused-registration component with the stable hierarchy: Registration, Primary work, Entries grouped by Dog, Payment, and Communication/history.
- [x] 3.5 Wire child Entry status, edit, Armband, comp/uncomp, removal, payment/refund, and lifecycle email controls to existing handlers/dialogs/action definitions with no new mutation path.
- [x] 3.6 Add focused component tests for multi-Dog/per-Handler rendering, queue-relevant expansion, valid status dispatch, payment emphasis, keyboard focus return, and desktop/narrow transitions.

## 4. Selection and exception consolidation

- [x] 4.1 Add tests for registration-level select-all, indeterminate state, filter pruning, child Entry expansion, exact eligible-subset counts, and first-selection toolbar appearance.
- [x] 4.2 Implement the compact floating selection toolbar and bind it to existing bulk eligibility, duplicate-dispatch prevention, partial-failure, retry, and offline-capable mutation paths.
- [x] 4.3 Consolidate Move-ups, Pulls/Scratches, and Waitlist under one Exceptions peer using the existing components and add legacy URL/deep-link tests.
- [x] 4.4 Preserve copy-link behavior for the new URL fields and safely retire the incompatible pre-launch saved-view schema with its Day-of/table/card state.

## 5. Page integration and deduplication

- [x] 5.1 Integrate the production cockpit into `EntryManagementPage` while preserving authorization, loading, load-error, action-error, retry, empty, and dialog boundaries.
- [x] 5.2 Preserve the existing Entry Management `EntryEditDialog` as the one complete field editor, prove the focused pane opens it without duplicating edit logic, and prove exhibitor My Entries remains unaffected.
- [x] 5.3 Apply the same persistent focused-row grammar to Show Desk and add a regression test that focus and bulk selection remain distinct.
- [x] 5.4 Remove the dev-only prototype route/switcher and delete only superseded statistics-card, table/card, Day-of, breadcrumb, or legacy presentation code with no remaining callers.
- [x] 5.5 Keep production files below 500 lines and review the final dependency graph for duplicate selectors, duplicate actions, or new direct Supabase paths.

## 6. Verification and tracking

- [x] 6.1 Run focused Vitest suites for grouping, classification, URL normalization/writers, responsive state, queue, focused pane, bulk toolbar, Exceptions, Entry Management page states, and Show Desk focus.
- [x] 6.2 Run myK9Show TypeScript checking, targeted lint/diff checks, and the relevant existing Entry Management and Show Desk regression suites; record unrelated failures separately.
- [x] 6.3 Browser-walk the approved two-Trial/hundreds-of-Entries scenario at 1366px desktop, narrow in-app width, and tablet in light/dark themes; verify focus feedback, search, deep links, Back/Forward, selection, actions, and no serious accessibility/console errors.
- [x] 6.4 Verify already-loaded queue/search/detail behavior after disabling network and confirm all mutations continue through established replication/offline paths.
- [x] 6.5 Update the UX audit/tracking docs with implementation evidence and mark `entry-peek-pane` superseded without archiving this change before merge.
- [x] 6.6 Exercise grouping, queue changes, and representative searches against at least 1,000 synthetic child Entries and record that interactions remain responsive without new network requests.

## 7. PR and merge gate

- [x] 7.1 Commit the verified implementation, review the diff for unrelated changes, and open a PR using the repository template with OpenSpec, tests, visual evidence, risk, non-goals, and agent involvement.
- [x] 7.2 Required CI and review completed, actionable smoke-test failures were fixed, and the product owner explicitly approved the merge.
- [x] 7.3 PR #1419 was verified merged; the OpenSpec change was synced and archived, tracking was updated, and its feature branch/worktree were removed.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The change replaces a core secretary workflow, alters URL compatibility and grouping/selection units, and must preserve offline-capable entry mutations across Entry Management and Show Desk.
