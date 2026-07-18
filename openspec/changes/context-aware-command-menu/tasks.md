## 1. Inventory and shared contract

- [x] 1.1 Inventory `CommandPalette`, `AppHeader`, `KeyboardShortcutsOverlay`, `useRecentSearches`, current data stores, and permission checks.
- [ ] 1.2 Define command-provider types for route context, show scope, selection, permissions, result grouping, action eligibility, target navigation, and authenticated-user recent-history namespaces.
- [ ] 1.3 Add parity tests proving the selected-entry check-in command uses the same action ID/handler as row and bulk projections and is absent when the `MYK9-47` registry entry is unavailable.

## 2. Contextual palette behavior

- [ ] 2.1 Add contextual navigation and direct dog/people/show/trial result providers; route class and entry queries to their canonical show-scoped owner lists with normalized prefilled filters instead of adding an individual-record index.
- [ ] 2.2 Add only the allowlisted “Check in selected entries” mutation via the merged `MYK9-47` registry (`entityActions.ts`, PR #1376); keep class status, other entry status, Trial, Dog, and People mutations out of scope.
- [ ] 2.3 Add show/trial/class context labels and prevent ambiguous cross-show action targets.
- [ ] 2.4 Add bounded result limits, loading/empty/error states, offline/local fallback, authenticated-user recent-history namespacing, account-change clearing, and permission/show-scope revalidation/redaction.

## 3. Shortcuts and accessibility

- [ ] 3.1 Reconcile the supported shortcut vocabulary between `AppHeader`, the palette, and `KeyboardShortcutsOverlay`: register all shortcuts in `useKeyboardShortcuts` and derive palette badges and overlay entries from that registry; remove display-only badges.
- [ ] 3.2 Add component tests for pointer/touch opening, keyboard focus, Escape/close, result selection, permission suppression, and shortcut help.
- [ ] 3.3 Add dispatch-failure tests for the check-in command: failed mutation surfaces plain-language retry/recovery feedback, no duplicate dispatch occurs, and the palette/target row does not claim an unaccepted durable state.

## 4. Verification and implementation gate

- [ ] 4.1 Run focused Command Palette/AppHeader tests and `pnpm openspec validate context-aware-command-menu --type change --strict --no-interactive`.
- [ ] 4.2 Run `pnpm typecheck`, `pnpm lint`, and the relevant myK9Show test suite.
- [ ] 4.3 Run role-based desktop/tablet browser verification for navigation, selection-aware actions, offline/local results, and keyboard/pointer parity.
- [ ] 4.4 Open the PR with non-goals, action parity evidence, shortcut documentation, review, CI, and merge evidence before archive.
