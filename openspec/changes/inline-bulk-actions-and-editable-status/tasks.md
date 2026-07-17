## 1. Surface and mutation inventory

- [ ] 1.1 Inventory the canonical management surface, row identity, permission check, editable state fields, and mutation owner for Entries, Classes, Trials, Dogs, and People; record any surface that must remain dialog-driven because it requires notes or other input.
- [ ] 1.2 Confirm the existing Entry Management and Class Management selection/action behavior, including enrollment-vs-class-entry selection units, before replacing local state.
- [ ] 1.3 Confirm the offline/replication boundary for entry status, class status, and check-in; document any online-only follow-on adapter rather than adding a direct write.

## 2. Shared selection and action contracts

- [ ] 2.1 Add typed selection state for stable IDs, visible-row selection, indeterminate select-all, scope-change clearing, and pruning IDs removed from loaded data.
- [ ] 2.2 Add typed entity action definitions covering single-object vs bulk render context, label, permission, eligibility, all-selected vs eligible-subset scope, pending state, mutation callback, result wording, and optional safe recovery.
- [ ] 2.3 Add the shared selection/action bar using existing shadcn/ui primitives with selected count, Actions menu, clear selection, responsive tablet layout, visible focus, and 44px minimum targets.
- [ ] 2.4 Add bulk outcome aggregation and retry/partial-success feedback without introducing a routine confirmation dialog or duplicate dispatch.
- [ ] 2.5 Add unit tests for selection clearing/pruning, indeterminate selection, action filtering, scope rules, duplicate activation, and complete/partial/failed outcomes.
- [ ] 2.6 Add tests proving single-object and bulk projections use the same action definitions without exposing bulk-only actions in a single-row menu.

## 3. Inline state editing

- [ ] 3.1 Extend the existing interactive badge pattern into a shared accessible inline state menu that distinguishes editable buttons from read-only badges and supports keyboard activation/focus transfer.
- [ ] 3.2 Add typed state-menu adapters that derive permitted values from existing role/transition rules and route note-bearing or complex changes to the existing owner dialog.
- [ ] 3.3 Add optimistic/pending/error handling at the adapter boundary, preserving the existing replication-backed behavior for core show-day state and quiet background sync.
- [ ] 3.4 Add component tests for badge semantics, keyboard/touch interaction, permitted values, pending duplicate prevention, optimistic success, rollback/error, and complex-dialog fallback.

## 4. Migrate Class Management

- [ ] 4.1 Replace `ClassManagementPage`’s local selection state and bulk status controls with the shared selection/action contract, preserving its filters, lifecycle presentation, and existing safe-delete behavior.
- [ ] 4.2 Make the class status badge/menu use the existing class lifecycle vocabulary and `useUpdateClassMutation`/canonical class mutation path; do not duplicate lifecycle derivation.
- [ ] 4.3 Consolidate the local class `MoreVertical` dropdown and `ClassRowActionsMenu` onto the canonical row-menu/action-definition path; do not add another single-class action button.
- [ ] 4.4 Add focused Class Management tests proving select-all-visible scope, filter-change clearing, single-row menu actions, bulk status updates, permission/action availability, and partial failure feedback.

## 5. Migrate Entry Management and show-day check-in

- [ ] 5.1 Add the shared selection/action bar to the canonical Entry Management view using the existing `useEntryManagementActions` handlers and the correct selection unit for the visible list; preserve `EntryRowActionMenu` as the single-entry action surface.
- [ ] 5.2 Expose routine bulk status and eligible bulk check-in through the contextual Actions menu, removing only redundant routine confirmation behavior while preserving actions that require additional information.
- [ ] 5.3 Update `CheckInStatusBadge`/the entry row integration to use the inline state menu for routine staff check-in changes and retain `CheckInStatusDialog` for note-bearing or role-specific workflows.
- [ ] 5.4 Verify entry and check-in mutations remain on `changeSecretaryEntryStatus`, `executeBulkStatusChange`, `updateReplicatedCheckInStatus`, and the established replication/RBAC paths.
- [ ] 5.5 Add focused Entry Management and check-in tests for row-menu parity, eligible-subset counts, offline/queued behavior, optimistic rollback, partial failures, duplicate taps, and unauthorized action suppression.

## 6. Follow-on entity adapters

- [ ] 6.1 Add Trial, Dog, and People adapters only after their inventory in task 1 confirms the canonical surface, state field, permission, and safe existing writer.
- [ ] 6.2 Add the shared selection pattern to each confirmed surface without creating a new management page or cross-entity selection model.
- [ ] 6.3 Add focused tests for each adapter’s action availability, state transitions, online/offline limitation, and partial-result behavior; leave unsupported actions absent rather than inventing a new writer.

## 7. Verification and UX evidence

- [ ] 7.1 Run `pnpm openspec validate --change "inline-bulk-actions-and-editable-status"` and verify every spec scenario has a corresponding test or explicit browser evidence.
- [ ] 7.2 Run focused Vitest files for shared selection, action aggregation, inline state menu, Class Management, Entry Management, and check-in behavior.
- [ ] 7.3 Run `pnpm typecheck`, `pnpm lint`, and `cd apps/myk9show && pnpm test`; stop and report if a runner hangs for more than 60 seconds.
- [ ] 7.4 Run the targeted secretary/steward Playwright walk at tablet width in connected and offline/queued conditions, covering keyboard focus, filter-scoped selection, inline badge editing, permission differences, and partial failure recovery.
- [ ] 7.5 Review the diff for duplicated surfaces, direct PostgREST writes in core show-day paths, lost `// INTENT:` comments, inaccessible controls, and files over the 500-line guideline.

## 8. Tracking and implementation gate

- [ ] 8.1 Update the relevant sprint/debt tracking document only if this implementation closes an existing tracked item; do not invent a new status or mark planning complete as implementation complete.
- [ ] 8.2 Record the implementation issue/Linear link and evidence required for secretary/steward acceptance; move the issue to Done only after the evidence gate is complete.
- [ ] 8.3 Open the implementation PR with the OpenSpec change name, acceptance coverage, risk, non-goals, test commands, browser evidence, and any follow-up adapter scope.
- [ ] 8.4 Run focused review/Codex review and CI; address blocking findings and wait for green required checks.
- [ ] 8.5 Merge the PR from the main repository directory, then archive this OpenSpec change only after merge evidence is available; do not archive this planning-only request as implemented before that gate.
