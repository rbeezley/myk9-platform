## Why

myK9Show already has a `CommandPalette` with navigation, dog/person/show search, recent searches, role checks, and static actions. It is a strong foundation, but it is not yet connected to the same contextual action definitions used by row menus, badges, and bulk selection. Extending it would give experienced secretaries a fast way to find a dog, open a show, or run a permitted action without making keyboard use mandatory.

This supports fall 2026 launch readiness by shortening navigation and reducing hunting across a large pre-show data set. It does not duplicate an existing surface: the command menu is an access layer into existing pages and mutations, not a new place to manage records.

## What Changes

- Make the existing Command Palette context-aware: show current-surface navigation and, after the `MYK9-47` shared action registry exists, the first allowlisted mutation, “Check in selected entries,” only when applicable.
- Reuse the shared action definitions from `MYK9-47` for row, bulk, and command-menu execution.
- Improve search grouping and result labels for dogs, people, shows, and trials while preserving permission scoping; in the first release, class and entry queries navigate to their canonical show-scoped owner lists with a prefilled filter instead of indexing individual records in the palette.
- Add a small, documented set of optional keyboard shortcuts and keep all actions available by pointer/touch.
- Preserve recent-search behavior with authenticated-user namespacing, account-change clearing, scope revalidation, and clear empty/error states.

### Non-goals

- No keyboard-only workflow or shortcut requirement for secretaries/stewards.
- No command-menu-owned mutation logic or direct database writes.
- No new global command-center page or unrestricted cross-show data exposure.
- No natural-language assistant or AI action execution in this change.

## Capabilities

### New Capabilities

- `context-aware-command-menu`: Search and execute permitted navigation/actions from the existing Command Palette with current-surface context.

### Modified Capabilities

None. Existing RBAC, row-menu, bulk-action, and replication contracts remain authoritative.

## Impact

- Affects `apps/myk9show/src/components/common/CommandPalette.tsx`, `AppHeader`, `KeyboardShortcutsOverlay`, `useRecentSearches`, and the shared action registry from `MYK9-47`.
- Requires bounded data indexing/search behavior so the menu does not render unbounded datasets or stale unauthorized results.
- Requires focused component, permission, keyboard, navigation, and action-dispatch tests.
- Is sequenced after the `MYK9-47` shared action registry. Navigation can ship independently, but the initial command mutation cannot ship before that dependency and does not expand beyond eligible selected-entry check-in.
