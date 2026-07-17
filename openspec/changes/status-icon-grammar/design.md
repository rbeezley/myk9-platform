## Context

Status rendering for entries, classes, and trials is spread across many components and helpers:

- Separate badge components: `components/shows/EntryStatusBadge.tsx`, `components/common/CheckInStatusBadge.tsx`, `components/exhibitor/CheckInStatusBadge.tsx`, `components/classes/ClassResultsTable/StatusBadge.tsx`.
- Inline status→style/icon logic: `utils/entryStatusUtils.ts` (`getEntryStatusBadgeStyle`), `utils/entryManagementUtils.ts`, and per-surface maps in tables/cards (`components/trials/TrialDetail/*`, `components/schedule/*`, `components/offline-checkin/*`, `components/entries/management/EntryListCard.tsx`).
- A prior unguarded `MAP[dbStatus]` lookup produced a crash; the codebase already has a `'no-status'` neutral convention (`types/check-in-types.ts`, `types/exhibitor-types.ts`) that fallbacks should reuse.

The ux-contrast token system (recently landed) is the source for status colors. The goal is one shape-first grammar per status family, consumed everywhere, with duplicates deleted as call sites migrate.

## Goals / Non-Goals

**Goals:**

- One shared `StatusIcon` grammar for entry, class, and trial status families: a single status→(shape, color, label) map per family.
- Shape encodes state, not color alone; legible at the smallest table/tablet size.
- A mandatory, defined fallback for any unmapped status value — never crash, never render blank.
- Colors from ux-contrast tokens, verified in light and dark themes.
- Migrate existing entry/class/trial status renderings to the shared component and remove the redundant maps/components.

**Non-Goals:**

- No change to status taxonomy, enum values, or transition rules.
- No unification of unrelated status families (email-delivery, promo-code, system-health) — different semantics, out of scope.
- No redesign of the surrounding badge/table/card layouts beyond swapping in the shared icon.
- No new theming tokens beyond what ux-contrast already provides (add only if a status color is genuinely missing, and note it).

## Decisions

### 1. Shape-first grammar, one map per family

Define a small, explicit grammar where each status maps to a shape variant (e.g. dashed ring = not-started/backlog, empty ring = pending, half-filled = in-progress, filled = complete, warning glyph = needs-attention) plus a token color and an accessible label. Entry, class, and trial each get their own map because their state sets differ, but they share the same shape vocabulary so a "complete" class and a "complete" entry read the same way.

The shared component is presentation-only: it takes a status value and family and renders shape + color + accessible label. It performs no data access and no mutation.

Alternative considered: one universal map across all families. Rejected — the families have different state sets and conflating them invites the same drift in reverse. Shared *vocabulary*, separate *maps*.

### 2. Mandatory fallback — the crash-class fix

Every family map lookup goes through a helper that returns the mapped descriptor or a defined neutral fallback (`'no-status'` convention already in the codebase) for unknown/undefined values. Direct `MAP[status]` indexing is disallowed in the shared component and in migrated call sites. This is the concrete removal of the unguarded-lookup crash class, so it is a first-class requirement, not an afterthought.

### 3. Colors from ux-contrast tokens, verified both themes

Status colors reference ux-contrast tokens rather than hardcoded hex. Because shape already differentiates states, color is reinforcement, not the sole signal — which is what makes it safe for color-blind users. Contrast is verified in light and dark for every status.

### 4. Migrate and delete, surface by surface

Migration converts each entry/class/trial status rendering to the shared component and removes the local map/badge it replaces. The duplicate badge components (`EntryStatusBadge`, the two `CheckInStatusBadge`s, `ClassResultsTable/StatusBadge`) and inline icon maps are deleted as their last caller migrates. A source-level test asserts no legacy per-surface entry/class/trial icon map remains, so the duplicates cannot silently regrow.

### 5. Scope boundary: entry/class/trial only

Email-delivery status (`EmailStatusIcon`, `EntryDecisionEmailStatus`), promo-code status, and system-health status are explicitly excluded — they have unrelated semantics and their own maps. Touching them would widen the blast radius without benefit. The proposal and specs name the in-scope families exactly.

## Risks / Trade-offs

- **[Risk] A migrated status loses a distinction the old surface had.** → Enumerate every status value per family before migrating; the family map must cover the full enum, asserted by an exhaustive-coverage test.
- **[Risk] Deleting a badge component breaks a caller.** → Grep all callers before deletion; delete only when the last caller has migrated (mirrors the empty-state and EntryEditDialog scoping discipline).
- **[Risk] Shape grammar is not legible at small sizes.** → Verify each shape at the smallest table/tablet render size during the browser sweep.
- **[Risk] Duplicate maps regrow later.** → Source-level test that fails if a new per-surface entry/class/trial status icon map appears.
- **[Risk] Scope creep into email/health/promo status.** → Explicit in-scope family list in the spec; those families are named as out of scope.
- **[Trade-off] A single grammar constrains per-surface visual freedom.** → Intended; consistency is the point, and display presets (MYK9-48) still control columns/density, not status meaning.

## Open Questions

- Exact shape vocabulary per state (which glyph for needs-attention vs. conflict) — settle during the first browser walk with real data.
- Whether the trial family is large enough to warrant its own map now or can defer until a trial surface demonstrably needs it.
