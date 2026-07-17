## Why

Entry, class, and trial statuses are rendered by many independently maintained status→icon/color maps and several separate badge components (`components/shows/EntryStatusBadge.tsx`, `components/common/CheckInStatusBadge.tsx`, `components/exhibitor/CheckInStatusBadge.tsx`, `components/classes/ClassResultsTable/StatusBadge.tsx`, plus inline maps in `utils/entryStatusUtils.ts`, `utils/entryManagementUtils.ts`, table and card components, and more). Two problems follow:

1. **Correctness.** Divergent, sometimes unguarded `MAP[status]` lookups have already produced a status-map lookup crash. Each duplicate map is another place a new or renamed status can crash or render blank.
2. **Legibility.** The same status can look different on different surfaces, and today's badges lean on color to carry meaning. Linear's status circles work because *shape* encodes state (dashed / empty / half-filled / filled), readable at small sizes and independent of color perception. myK9Show's users skew older and work on tablets in bright venues, so shape-coded status helps them more than most audiences.

Consolidating to one shape grammar removes the crash class and makes status readable everywhere at once. This is consolidation work, in keeping with the current phase: converge, then delete the duplicates.

## What Changes

- Introduce a single shared `StatusIcon` grammar for the entry, class, and trial status families: one status→shape+color map per family, where shape (not only color) varies with state, plus a defined fallback for unknown values.
- Migrate the existing entry/class/trial status renderings (badges, tables, cards, the Class Details readiness strip, Show Desk, and the attention summary) to consume the shared component.
- Guarantee a non-crashing fallback for any unmapped status value (`?? 'no-status'`-style guard), eliminating the unguarded-lookup crash class.
- Source colors from the ux-contrast token system and verify contrast in light and dark themes.
- Keep icons legible at the smallest size used in tables and on tablets.
- Remove the now-redundant per-surface status→icon maps and duplicate badge components as call sites migrate.

## Capabilities

### New Capabilities

- `status-icon-grammar`: A shared, shape-first status icon system for entry/class/trial statuses with a single source-of-truth map per family, a mandatory unknown-value fallback, and token-based theming.

### Modified Capabilities

None. Status taxonomy, values, and transition rules are unchanged; only how a status is *rendered* is unified.

## Impact

- Affects entry/class/trial status rendering across badges, tables, cards, Class Details, Show Desk, and the attention summary; the shared maps in `utils/entryStatusUtils.ts` and `utils/entryManagementUtils.ts`; and the ux-contrast tokens consumed for status colors.
- Removes duplicate status badge components and inline icon maps as surfaces migrate.
- Related to `inline-bulk-actions-and-editable-status` (MYK9-47, inline status badges) and `show-attention-and-context-navigation` (MYK9-50, attention summary), which both render status and benefit from the shared grammar.
- Out of scope: unrelated status families with their own semantics (e.g. email-delivery status, promo-code status, system-health status) — this change is limited to entry/class/trial.
- No database migration and no change to status enums.
