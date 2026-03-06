# Linear-Inspired UX Patterns Plan

**Date:** 2026-03-06
**Scope:** myK9Show only (myK9Q has its own UX paradigm — at-the-show, offline-first)
**Guiding principle:** Adopt Linear's polish without losing myK9's domain personality. Every pattern must serve INTENT.md — "the software disappears so the dogs can shine."

---

## Current State Assessment

| Pattern                        | Status        | Notes                                                                                                                                                               |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command palette (Cmd+K)        | EXISTS        | Working `CommandPalette.tsx` with cmdk, navigation/data/actions groups, recent searches. Two dead enhanced variants to delete.                                      |
| Keyboard shortcuts overlay (?) | MISSING       | No global shortcut registry, no overlay UI                                                                                                                          |
| Filter/sort bar (pill-based)   | MISSING       | No shared composable filter component                                                                                                                               |
| Empty states                   | EXISTS (good) | Rich `EmptyState` component family with domain-specific variants (dogs, registrations, competitions, health). Separate `EmptyStateView` base component also exists. |
| Toast notifications            | EXISTS (good) | Sonner-based `notifications` service + `UndoToast` with progress bar and specialized variants                                                                       |

---

## Work Items

### 1. Clean Up Command Palette (Small — ~1hr)

**Problem:** Two dead "enhanced" command palette files that are never imported.

**Tasks:**

- [x] Delete `CommandPaletteEnhanced.tsx` and `EnhancedCommandPalette.tsx`
- [x] Audit the active `CommandPalette.tsx` for improvements:
  - Add keyboard shortcut hints next to navigation items (e.g., "G then D" for Dogs)
  - Show a footer with keyboard navigation hints ("Arrow keys to navigate, Enter to select, Esc to close")
  - Search should filter data items beyond the first 5 (currently `dogs.slice(0, 5)` — should search all, display top 5 matches)
  - [ADDED] **Performance:** Use `useMemo` with search term to filter all items, then slice top 5 results. For large datasets (100+ dogs), debounce the search input by 150ms to avoid lag on every keystroke.

**Files:**

- `apps/myk9show/src/components/common/CommandPaletteEnhanced.tsx` (delete)
- `apps/myk9show/src/components/common/EnhancedCommandPalette.tsx` (delete)
- `apps/myk9show/src/components/common/CommandPalette.tsx` (improve)

---

### 2. Keyboard Shortcuts System + Overlay (Medium — ~3hr)

**Problem:** No global keyboard shortcut registry. Users can't discover shortcuts. No "?" overlay.

**Design (Linear-inspired, domain-appropriate):**

- Press `?` anywhere (when not in an input) to show a shortcuts overlay dialog
- Overlay groups shortcuts by category: Navigation, Actions, Views
- Shortcuts use "go to" pattern: `G then D` = Go to Dogs, `G then S` = Go to Shows
- Overlay is a simple modal with clean typography — no animation bloat (INTENT.md: "not flashy")

**Tasks:**

- [x] Create `useKeyboardShortcuts` hook — central registry for shortcuts with scope awareness (disabled when input/textarea focused)
- [x] Create `KeyboardShortcutsOverlay` component — dialog showing all registered shortcuts grouped by category
- [x] Register default shortcuts:
  - `?` — Show shortcuts overlay
  - `Cmd+K` — Command palette (already works, just register for display)
  - `G D` — Go to Dogs
  - `G P` — Go to People
  - `G S` — Go to Shows
  - `G C` — Go to Clubs
  - `C D` — Create Dog
  - `C S` — Create Show
  - `C P` — Create Person
  - `Esc` — Close any open dialog/panel
- [x] Wire into app layout (AppHeader or root layout)

**[ADDED] Chord mechanics:**

- Chord timeout: 500ms between keys (e.g., press G, then D within 500ms). After timeout, reset chord buffer.
- When a modal/dialog is open, suppress all shortcuts except `Esc`. The shortcuts overlay itself closes on `Esc` or clicking outside.
- Don't conflict with browser defaults: avoid `Ctrl+N`, `Ctrl+T`, `Ctrl+W`, etc. Only use sequences (`G D`) and `?` which browsers don't claim.
- [ADDED] **Accessibility:** Overlay must be keyboard-navigable (tab through sections), use `role="dialog"` with `aria-label="Keyboard shortcuts"`, trap focus while open.

**[ADDED] Tests:**

- Unit test `useKeyboardShortcuts`: chord sequence fires correct callback, resets after timeout, suppressed in input/textarea, suppressed when modal open
- Unit test `KeyboardShortcutsOverlay`: renders all registered shortcuts grouped by category

**Files to create:**

- `apps/myk9show/src/hooks/useKeyboardShortcuts.ts`
- `apps/myk9show/src/components/common/KeyboardShortcutsOverlay.tsx`

**Files to modify:**

- `apps/myk9show/src/components/layout/AppHeader.tsx` (or root layout — wire in the hook)

---

### 3. Composable Filter/Sort Bar (Medium-Large — ~4hr)

**Problem:** No shared, composable filter UI. Each list page rolls its own filter controls (or has none).

**Design (Linear-inspired pill pattern):**

- Horizontal bar with pill-shaped filter tokens
- Each pill shows: `[icon] Label: Value [x]`
- Click a pill to edit its value (popover with options)
- "Add filter" button at the end opens a picker of available filter types
- Sort indicator as a special pill: `Sort: Name (A-Z)`
- Filters are composable — each page declares which filters are available
- URL-synced so filters survive page refresh

**Tasks:**

- [x] Create `FilterBar` component — renders active filter pills + "Add filter" trigger
- [x] Create `FilterPill` component — individual pill with popover for editing
- [x] Create `SortPill` component — sort direction toggle pill
- [x] Create `useFilterBar` hook — manages filter state, URL sync, provides `addFilter`, `removeFilter`, `updateFilter`, `setSort`
- [x] Create filter type definitions: `text`, `select`, `multi-select`, `date-range`, `boolean`
- [x] Integrate into one pilot page (Dogs list or Shows list) as proof of concept

**[ADDED] Performance:**

- Debounce URL updates by 300ms — typing in a text filter shouldn't trigger a URL change on every keystroke
- Memoize filtered results with `useMemo` keyed on filter state
- For `multi-select` popovers with large option lists (100+ breeds), use virtualized list or search-within-popover

**[ADDED] Accessibility:**

- Each pill: `role="status"`, `aria-label="Filter: {label} is {value}"`, remove button has `aria-label="Remove {label} filter"`
- "Add filter" button: `aria-haspopup="listbox"`
- Filter popover: focus trap, `Esc` to close, `Enter` to confirm

**[ADDED] Tests:**

- Unit test `useFilterBar`: add/remove/update filters, URL sync round-trip, setSort
- Component test `FilterBar`: renders pills, remove button works, "Add filter" opens picker

**Files to create:**

- `apps/myk9show/src/components/common/FilterBar/FilterBar.tsx`
- `apps/myk9show/src/components/common/FilterBar/FilterPill.tsx`
- `apps/myk9show/src/components/common/FilterBar/SortPill.tsx`
- `apps/myk9show/src/components/common/FilterBar/types.ts`
- `apps/myk9show/src/hooks/useFilterBar.ts`

---

### 4. Consolidate Empty States (Small — ~1hr)

**Problem:** Two overlapping empty state base components (`EmptyState` in common/ and `EmptyStateView` in base/). The common/ version is richer and more complete.

**Tasks:**

- [x] Audit usage of `EmptyStateView` (base/) — migrate consumers to `EmptyState` (common/)
- [x] [ADDED] **Prop migration:** `EmptyStateView` takes `action` as `ReactNode`; `EmptyState` takes `action` as `{ label, onClick, variant?, icon? }`. Each consumer must be rewritten to use the structured prop shape — this is not a simple import swap.
- [x] Delete `EmptyStateView` once all consumers migrated, or keep as a thin wrapper if heavily used
- [x] Ensure all major list pages use domain-specific empty state variants (check Shows, People, Clubs lists)
- [x] Review empty state copy — Linear's pattern is: simple illustration + one clear CTA, no walls of text. Our descriptions may be too verbose in some variants.
- [x] [ADDED] **Icons vs. illustrations:** Keep Lucide icons (not custom illustrations). Our domain variants already use meaningful icons (PawPrint, Trophy, Stethoscope) which are clearer than generic illustrations for dog show users. The "Linear look" here is about concise copy + single CTA, not illustration style.

**Files:**

- `apps/myk9show/src/components/base/EmptyStateView.tsx` (migrate away or delete)
- `apps/myk9show/src/components/common/EmptyState.tsx` (canonical)
- Various consumer files

---

### 5. Toast Notification Improvements (Small — ~1hr)

**Problem:** The toast system works well but has a few gaps vs. Linear's pattern.

**Tasks:**

- [x] Verify toasts stack properly when multiple fire (sonner handles this, but confirm visually)
- [x] Wire real undo actions in `actionNotifications.deleted()` — currently has a placeholder. Make the `onUndo` callback a required parameter instead of a stub.
- [x] Audit `UndoToast` — it's a separate component from sonner toasts. Consider whether to consolidate into sonner's action pattern for consistency (one toast system, not two).
- [x] Add a brief audit of which destructive actions actually show undo toasts vs. confirmation dialogs. Per INTENT.md secretary anti-patterns: "Confirmation dialogs for routine actions" — prefer undo toasts over confirm dialogs where safe.
- [x] [ADDED] **Auto-dismiss strategy:** Define duration tiers — success: 4s, info: 4s, warning: 5s, error: 6s (stays longer), undo: 8-10s (needs time to react). Document in `notifications.ts` as constants so they're consistent across the app.

**Files:**

- `apps/myk9show/src/lib/notifications.ts`
- `apps/myk9show/src/components/optimistic/UndoToast.tsx`

---

## Priority Order

1. **Clean up command palette** — quick win, removes dead code
2. **Keyboard shortcuts system** — high-impact discoverability feature
3. **Toast improvements** — quick polish pass
4. **Empty state consolidation** — reduce component duplication
5. **Filter/sort bar** — largest effort, highest UX impact for list-heavy pages

---

## Out of Scope (Intentional)

- **myK9Q changes** — different app, different UX paradigm (offline-first, tablet-optimized)
- **Animations for their own sake** — INTENT.md explicitly says "not flashy or trendy"
- **"Power user" features that leave beginners behind** — INTENT.md: "no hidden features, no 'power user' shortcuts that leave beginners behind." Keyboard shortcuts must be purely additive — everything must remain discoverable via mouse/touch.
- **Generic SaaS personality** — dog show domain personality (career pride, "that was easy") takes priority over mimicking Linear's aesthetic
