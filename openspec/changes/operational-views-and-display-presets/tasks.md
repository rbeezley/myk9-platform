## 1. Inventory and contracts

- [ ] 1.1 Inventory Entry Management and Class Management filter, scope, grouping, visible-column, and display state; identify which values already serialize to URLs.
- [ ] 1.2 Define typed operational-view state, preset IDs, serialization version, surface ownership, and allowlisted display options.
- [ ] 1.3 Define the local preference key/version and invalid-data recovery behavior without adding a database table.

## 2. Entry Management views

- [ ] 2.1 Add curated Entry Management presets for review, payment due, check-in, and all entries using the existing URL normalizer.
- [ ] 2.2 Add normalized URL round-trip and invalid-parameter tests for show, trial, class, payment, attention, mode, view, roster, and search context.
- [ ] 2.3 Clear shared row selection whenever Entry Management view identity changes.

## 3. Class Management and display presets

- [ ] 3.1 Add curated Class Management lifecycle presets without duplicating class lifecycle derivation.
- [ ] 3.2 Add allowlisted display presets that preserve identity, status, selection, judge, and row actions.
- [ ] 3.3 Add personal local save/reapply behavior with invalid-storage and storage-unavailable tests.

## 4. Workbench routing and UX verification

- [ ] 4.1 Add only deep links from existing Workbench readiness surfaces to the canonical filtered destination; do not render a second list.
- [ ] 4.2 Add component tests proving presets expose clearing actions, preserve permissions, and clear selection.
- [ ] 4.3 Run focused Vitest files, `pnpm openspec validate operational-views-and-display-presets --type change --strict --no-interactive`, `pnpm typecheck`, and `pnpm lint`.
- [ ] 4.4 Run secretary/steward tablet browser verification for preset selection, refresh/back navigation, URL sharing, offline/cached data, and readability.

## 5. Tracking and implementation gate

- [ ] 5.1 Update the relevant sprint/debt tracking document only if implementation closes an existing tracked item.
- [ ] 5.2 Open the implementation PR with OpenSpec reference, acceptance evidence, non-goals, and follow-up scope.
- [ ] 5.3 Complete review and CI, merge from the main repository directory, then archive only after merge evidence.
