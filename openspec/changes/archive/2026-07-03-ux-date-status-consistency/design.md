## Context

myK9Show already built two canonical modules meant to be the single source of truth:

- `apps/myk9show/src/lib/format/dates.ts` — self-documented as "the single app-facing module... do not invent new ones at call sites." Exposes `formatShowDateRange`, `formatEntryDate`, `formatTime`.
- `apps/myk9show/src/services/entryDisplay/entryDisplaySelectors.ts` + `entryStatusUiAdapter.ts` — built to stop exhibitor My Entries, the Show Details "My Entries" tab, and secretary Entry Management from disagreeing on the same entry's status. Its header comment records the intentional exception: exhibitor-facing copy says "Pending Review," secretary-facing copy says "Pending," for the same underlying status.

Neither module is enforced. Roughly 9 other `formatDate`-named functions and 2 independent status-to-label/color maps (`components/exhibitor/EntryRow.tsx`, `utils/entryStatusUtils.ts`) still exist and are actively used, plus one fully ad-hoc badge (`components/classes/ClassResultsTable/StatusBadge.tsx`) with no shared config at all. Separately, two landing-page sections (`features/monogram/landing/sections/FinalCtaBand.tsx`, `HeroBlock.tsx`) show a "Closes {date}" label gated only on the date field's presence, not on the show's actual `canEnterOnline` state.

This is not a green-field design — it's consolidation onto modules that already exist. There is no new data model, no new external dependency, and no offline/replication surface: all of this is presentation-layer formatting of data already being fetched. `entryStatusUtils.getEntryStatus` does read `show.entryOpenDate`/`entryCloseDate` (replicated `Show` data) but this change touches only how it's *labeled*, not how the underlying entry/class data is synced or written.

## Goals / Non-Goals

**Goals:**
- Every app-facing date renders through `lib/format/dates.ts`; no new ad-hoc `formatDate`-style function gets added, and existing duplicates are removed once call sites migrate.
- Every entry/class/check-in status badge resolves its label/color/icon through the existing shared classifier for its domain, not a page-local map.
- A date-derived status label (e.g. "Closes {date}") always reflects the record's current status, not just whether a date field happens to be populated.
- Preserve every *documented* intentional copy difference (e.g. "Pending Review" vs "Pending") — this change removes accidental fragmentation, not deliberate role-specific wording.

**Non-Goals:**
- Redesigning the visual style of badges or date formats themselves (no new colors, no new format strings) — this is a consolidation pass, not a redesign.
- Touching the 7 timezone-bound landing-page `formatDateInTimezone` variants — they serve a genuinely different requirement (show's own timezone, not viewer's) and are already isolated per landing theme.
- Fixing `RoleRequestsPage.tsx`/`PayoutLedgerPage.tsx` admin-only status maps — not exhibitor/secretary-facing, not on the show-day critical path, deferred to a later pass.
- Adding new status states, new date fields, or new UI surfaces — everything here reads data and formatting rules that already exist.

## Decisions

**Decision: Migrate onto the existing canonical modules rather than writing new ones.**
Both `lib/format/dates.ts` and `entryDisplaySelectors.ts` were already built for this exact purpose and are documented as the intended single source of truth. Writing a third "more canonical" module would repeat the mistake this change is fixing. Alternative considered: introduce a new shared `@myk9/core` date/status package — rejected because it duplicates work already done in-app and the existing modules are already app-facing (dates.ts explicitly says not to invent new ones).

**Decision: Treat `entryDisplaySelectors.ts`'s documented copy differences as a preserved contract, not a bug.**
The file's own header comment states the exhibitor/secretary label split is intentional. Any migration of `EntryRow.tsx`/`entryStatusUtils.ts` onto the shared classifier must reproduce that split, not collapse it to one string. Alternative considered: unify all entry-status copy to one label everywhere — rejected, this is exactly the kind of unapproved behavior change `CLAUDE.md`'s `// INTENT:`-style protection is meant to prevent; the comment functions as that protection even without the literal `INTENT:` tag.

**Decision: [CORRECTED during implementation] Fix the date/status gating bug using `useCountdown(entryCloseDate, timezone).closed`, not `canEnterOnline`.**
Implementation found `canEnterOnline` means "classes have been assigned" (`hasEntryClassInventory !== false` in `MonogramLandingPage.tsx`) — a setup-completeness signal, not a registration-window-closed signal. Using it would have been a no-op: a show can have classes assigned *and* a closed registration window simultaneously, and `canEnterOnline` would still read `true`. The actual right signal already exists: `HeroBlock.tsx` already calls `useCountdown(entryCloseDate, timezone)` for its separate "Entries closed" banner and gets back a `closed: boolean` that flips exactly when `entryCloseDate` has passed — it just wasn't being used to gate the neighboring "Closes {date}" meta cell. `FinalCtaBand.tsx` didn't call the hook at all; it now does. This is a smaller, more idiomatic fix than the original plan (reuses an already-shared hook — "shared across premium landing pages" per its own docblock — instead of introducing new date math), and confirms design's "reference existing hooks before introducing new ones" instinct was right, just aimed at the wrong existing signal initially. The date field's meaning is still unchanged; only the gate is corrected. Alternative considered: compute a new derived "registration is open" boolean inside the date formatter itself — rejected, formatters shouldn't own status logic.

**Decision: [ADDED after scope review] Deduplicate `formatDateMMDDYYYY` in place rather than migrating its 16 call sites onto `lib/format/dates.ts`.**
Implementation surfaced that `formatDateMMDDYYYY` is defined identically in `packages/core/src/utils/dateFormatting.ts` and `apps/myk9show/src/utils/dateFormat.ts`, with 16 call sites across dog Pedigree/Competitions/TitleTracking, `TrialDetail`, and `RegistrationWorkflow` — none scoped in the original proposal. All 16 sites import from the app-local `@/utils/dateFormat` wrapper. Its output (`"8/1/2026"`, compact numeric) is a genuinely different visual style from the canonical module's prose weekday style (`"Sat, Aug 1, 2026"`), used in a different context (compact tabular/badge display vs. prose headers). Migrating those 16 call sites onto the canonical module would change their rendered output — a redesign, which this change's Non-Goals explicitly rule out. Instead: make `apps/myk9show/src/utils/dateFormat.ts` re-export `formatDateMMDDYYYY` from `@myk9/core` instead of redefining it, collapsing two definitions into one with zero call-site changes and zero visual-output change. Alternative considered: add a third "compact numeric" style to `lib/format/dates.ts` and migrate all 16 sites — rejected for this pass since it's a larger, unreviewed blast radius across unrelated features (dog profile pages) that deserves its own scoped proposal if a redesign is ever wanted, not a silent expansion of this consolidation pass.

**Decision: Migrate call sites in dependency order — low-risk display-only sites first, `entryStatusUtils`/`EntryRow` status maps last.**
Date-formatting call sites are pure presentational reads with no behavior branching, so they're safe to batch-migrate early. The status-map migrations require verifying the preserved-copy exception per site, so they're riskier and done individually with a visual check per surface (exhibitor My Entries, secretary Entry Management, Show Details tab).

## Risks / Trade-offs

- [Migrating `entryStatusUtils.ts`'s `getEntryStatusBadgeStyle` onto the shared classifier could silently change a status color/label a user has gotten used to] → Mitigation: diff old vs new label/color per status value before removing the old function; call out any user-visible change explicitly rather than assuming "shared" means "correct."
- [Removing a duplicate `formatDate` function that some other, un-surveyed call site still depends on] → Mitigation: grep-verify zero remaining references before deleting each function, not just before migrating the sites this proposal identified; run `pnpm typecheck` after each removal (a stray import breaks the build immediately, which is a cheap safety net here).
- [CORRECTED] The "Closes {date}" gating fix now derives its gate (`useCountdown(entryCloseDate, timezone).closed`) from the same `entryCloseDate` value the label itself displays, not from a separate prop that could be independently absent — so there is no "missing signal" case to fail open on. When `entryCloseDate` is null, `useCountdown` returns `closed: false, hasTarget: false` and the label correctly stays hidden, identical to pre-fix behavior. The only new behavior is: a *past* `entryCloseDate` now hides/relabels the text instead of showing a stale "Closes {date}" — exactly the bug being fixed, with no new missing-signal edge case introduced.
- [Scope creep: the audit may turn up more than the 3 landing-page instances or 2 status-map instances already found] → Mitigation: tasks.md scopes the initial pass to the sites already identified; anything additional found during migration gets logged in `OPEN-TODOS.md` rather than expanding this change's blast radius mid-flight.

## Migration Plan

1. Migrate date-formatting call sites onto `lib/format/dates.ts` (additive — old functions stay until every call site is moved).
2. Remove the now-unused duplicate `formatDate`-style functions once verified zero references remain.
3. Migrate `EntryRow.tsx` and `entryStatusUtils.ts` status maps onto the shared entry-status classifier, preserving documented copy differences; visually verify exhibitor My Entries, secretary Entry Management, and the Show Details tab.
4. Migrate `ClassResultsTable/StatusBadge.tsx` onto `packages/ui/src/components/StatusBadge` (or document why its "Scored/Editing/Pending" domain genuinely needs its own three-state logic, if the shared component can't express it).
5. Fix the `canEnterOnline` gating gap in `FinalCtaBand.tsx`/`HeroBlock.tsx` (monogram theme) and audit sibling landing themes for the same pattern.
6. No rollback complexity — each step is a like-for-like presentation change with no data migration; a bad step reverts via a normal git revert of that file's diff.

## Open Questions

- Do any of the 6 other landing themes (`gazette`, `heritage`, `magazine`, `headline`, `fieldGuide`, `banner`, `poster`) have the same unconditional "Closes {date}" pattern as `monogram`, or is it isolated? Resolve during Step 5's audit rather than guessing scope up front.
- Is `packages/ui/src/components/StatusBadge` expressive enough for `ClassResultsTable`'s scoring-progress domain (Scored/Editing/Pending derived from booleans, not a single status enum), or does that domain need its own documented classifier alongside the entry/check-in ones? Resolve during Step 4.
