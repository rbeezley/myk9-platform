## Context

`CommandPalette.tsx` already uses `cmdk` and provides grouped Navigation, Go to, Actions, and Recent Searches sections. It searches the locally available dog, people, and show stores, filters people by permission, and records recent commands. `AppHeader` owns opening the palette, while `KeyboardShortcutsOverlay` documents shortcuts.

The missing piece is contextual authority: the palette does not yet know the current entity selection, current management surface, or the action registry that powers row and bulk menus. The palette must become a fast doorway into existing workflows, not a second CRUD surface.

## Goals / Non-Goals

**Goals:**

- Make the existing palette useful from list, detail, show-day, and management contexts.
- Search loaded/cached data first and navigate to the canonical owner surface.
- Reuse action definitions, permission gates, pending behavior, and mutation handlers from the existing row/bulk patterns.
- Keep keyboard shortcuts optional, discoverable, and mirrored by pointer/touch controls.
- Preserve calm feedback and offline semantics.

**Non-Goals:**

- No new command-center route, entity editor, or alternate mutation layer.
- No full workspace index or network query on every keystroke.
- No natural-language intent parser or AI agent.
- No shortcut for every possible action.

## Decisions

### 1. Extend the existing Command Palette host

Keep `CommandPalette` and `AppHeader` as the host surfaces. Add a typed command provider contract that receives route context, selected entity IDs, current show scope, role/permissions, and the shared action registry. Providers return navigation commands, entity results, and executable actions.

The default groups remain “Navigation,” “Go to,” “Actions,” and “Recent.” Contextual actions are clearly labeled with their target, such as “Check in selected entries” or “Open class run sheet.”

Alternative considered: add a separate command-center page. Rejected because it duplicates navigation and management ownership.

### 2. Contextual commands must be narrower than global search

Global navigation and data search can show permitted dogs, people, shows, trials, classes, and entries. Mutating commands appear only when their target, scope, permission, and transition are known. If the user has no selection, the palette must not imply that “selected” actions are available.

The command provider uses the current show context to prevent cross-show action ambiguity. A result that navigates to another show must say so in its subtitle and land on that show’s canonical surface.

### 3. Reuse action definitions, never duplicate handlers

Single-row row menus, bulk action bars, inline badge menus, and the command palette consume the same typed action definitions. The command adapter supplies one target or the current selection and delegates to the existing domain handler. The palette does not call Supabase or replicated tables directly.

### 4. Search bounded local data and degrade quietly

The palette searches existing loaded stores and recent results first. It limits rendered results, scores title/name matches ahead of keywords, and does not issue unbounded network requests on each character. If a data source is loading, offline, or unavailable, the palette still offers navigation and local actions and explains the limited result set plainly.

Recent searches remain device-local, validated, and safe to clear. No sensitive result or unauthorized item may be persisted into recent history.

### 5. Offer a small shortcut vocabulary

Retain the existing header button and add only a few stable shortcuts: open palette, focus search, clear/close, and show help. A shortcut may accelerate navigation but may never be the only access path. The shortcut overlay is the documentation source and must reflect the implemented set.

### 6. Preserve pending, offline, and recovery behavior

When a command executes a mutation, the palette closes only according to the action contract. The initiating action shows pending state; success uses the existing local/replication semantics; failure returns plain-language feedback and a retry/recovery path. Background sync remains quiet.

## Risks / Trade-offs

- **[Risk] Palette exposes an action without the right permission.** → Build commands through the same permission-aware registry and add role-matrix tests.
- **[Risk] Global search leaks records across show scope.** → Preserve existing data-access gates and make show scope explicit for action commands.
- **[Risk] Palette becomes too large or noisy.** → Keep result caps, grouped labels, recent-first behavior, and context-sensitive action visibility.
- **[Risk] Shortcuts intimidate less technical users.** → Keep pointer/touch entry points primary and show shortcuts only as optional hints.
- **[Risk] Command action diverges from row/bulk behavior.** → Share action IDs, eligibility, and handlers; test parity.
- **[Trade-off] No remote full-text index initially.** → Prefer fast loaded-data search and canonical navigation; add server search only after measured need.

## Migration Plan

1. Inventory current Command Palette commands, AppHeader triggers, shortcut overlay text, data stores, and permission checks.
2. Add the shared command provider/action adapter types and parity tests.
3. Add contextual navigation and selection-aware actions to the existing palette.
4. Add bounded result/error/loading behavior and recent-search redaction/validation.
5. Reconcile shortcut documentation and run role-based browser verification on desktop and tablet.

Rollback removes contextual providers while preserving the existing global palette. No data migration is required.

## Open Questions

- Which command actions are safe enough for the first release: navigation only, or also check-in and selected-entry operations?
- Should the palette search classes and entries from replicated data in the first version, or navigate to the owner list with a prefilled filter?
- Which shortcuts are genuinely useful to secretaries, versus useful only to admin/power users?
