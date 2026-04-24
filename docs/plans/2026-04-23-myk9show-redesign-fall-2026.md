# myK9Show Redesign — Fall 2026

Picked up the 15-screen redesign package dropped into
`docs/designs/myK9show-redesign/myK9Show/`. This plan tracks what was
landed in the kickoff session and what remains.

## Source material

- `docs/designs/myK9show-redesign/myK9Show/HANDOFF.md` — build order
- `docs/designs/myK9show-redesign/myK9Show/DESIGN-NOTES.md` — locked decisions
- `docs/designs/myK9show-redesign/myK9Show/myK9Show Redesign.html` — visual canvas
- `.jsx` files — mockup implementations (read for copy / patterns, do not port line-for-line)

> **Sunset note:** `docs/designs/myK9show-redesign/` is a reference snapshot of
> the delivered mockup package. Once the redesign lands (all build steps below
> complete), this directory should be removed — the implemented components
> become the source of truth. Do not edit mockup files to reflect later
> changes; update the code and let the mockups go stale.

## Resolved scope decisions (2026-04-23)

1. **Redesign takes priority over Phase 2 Walk-the-Golden-Paths.**
   User decided it is not worth testing existing pages that may be
   replaced. Phase 2 is effectively paused; redesign is the active
   workstream.
2. **Accent stays user-selectable.** The mockup's role-keyed accent
   (secretary → terracotta, exhibitor → teal) is dropped. The existing
   `[data-accent]` system (clay / grove / dusk / heather) chosen in
   Preferences is preserved. Role-awareness ships through copy, nav
   items, and chips — not brand color swaps.
3. **Senior-friendly tokens dropped (YAGNI).** The mockup's 18px body
   default, 64px "senior" tap target, and `.senior-ui` wrapper were
   speculation about the target audience. Confirmed unnecessary — we
   use the existing 16px body + `size="xl"` (56px) for primary CTAs.
4. **Extend existing components; no parallel hierarchy.** `SidebarLayout`,
   `PageLayout`, `EntityCard`, `EntitySidebar`, Browse pages, etc.
   remain the foundation. Shells from the mockup (PageShell,
   DetailShell, Direction-B row cards) are applied by extending these,
   not recreating them.
5. **Mobile / tablet responsive is still not in v1.** Desktop-first at
   1400px per the mockup spec.

## Data model — already aligned (no migration needed)

Verified against `supabase/migrations/002_shows_and_events.sql` and
`003_entries_and_scoring.sql`:

| Redesign entity | Real schema                                                         | Notes                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show            | `shows`                                                             | Matches                                                                                                                                                         |
| Days            | _(none)_                                                            | Derived from `trials.date` — UI groups trials by date                                                                                                           |
| Trials          | `trials` (show_id FK)                                               | Matches                                                                                                                                                         |
| Classes         | `classes` (trial_id FK, has `element`, `level`, `competition_type`) | Scent Work 4×6 ready                                                                                                                                            |
| Entries         | `entries`                                                           | Matches                                                                                                                                                         |
| Result          | _(merged)_                                                          | Result columns live on `entries` (`result_status`, `search_time_seconds`, `total_faults`, `final_placement`, `judge_notes`). myK9Q "1 write per score" pattern. |

`entry_status` already supports both `scratched` and `absent` values —
the mockup's Absent-vs-Scratched spec (same state, different origin)
is already modeled.

## Build order (from HANDOFF)

### 1. Tokens + primitives — _landed_ (2026-04-23)

- `apps/myk9show/src/styles/redesign-tokens.css` — chip color pairs
  (green / amber / red / blue / purple / teal / stone, with dark-mode
  overrides) and layout tokens (`--sidebar-w`, `--content-max`,
  `--topbar-h`) for the shells.
- `apps/myk9show/src/components/base/Chip.tsx` — new primitive that
  consumes `--chip-*-bg/fg` tokens. 7 colors × 2 sizes + leading /
  trailing icon slots. 11 unit tests.
- Imported tokens layer from `index.css`.

Existing components already fit: `Button size="xl"` (56px),
`Badge`, `Card`, `PageLayout`, `SidebarLayout`. No new Button size needed.

### 2. Browse row-card shell — _landed_ (2026-04-23)

- `BrowseCard`: horizontal flex layout (avatar 48px | facts | action
  button) replacing the old vertical card. Grid changed from
  `lg:cols-2 xl:cols-3` → `xl:cols-2` across Dogs, Clubs, People.
  Children flattened to `flex-wrap` rows.
- `ShowCardHorizontal` (Shows) unchanged — already Direction-B.
- 13 unit tests in `BrowseCard.test.tsx`.
- `BrowsePeoplePage` page shell migration (uses old raw div layout,
  not `PageShell`/`PageHeader`) deferred to a future cleanup pass.

### 3. Unified Detail shell — _landed_ (2026-04-23)

- `DetailHero`: added `eyebrow` (small label above title) and `cover`
  (200px media slot on the left) props; all detail pages now share the
  same hero layout.
- `ShowDateBlock`: calendar-style date block used as the show cover
  image in `ShowDetailsPage`.
- `BrowseCard`: Direction-B horizontal row card (avatar | facts | action)
  applied to Dogs, Clubs, People browse pages; grid changed to `xl:cols-2`.
- Count-labeled tabs (`"Trials (3)"`) wired into `ShowDetailsPage`.
- 13 unit tests for `BrowseCard`.

### 4. Dog detail with rolling title progress — _landed_ (2026-04-24)

- `RollingTitleProgress`: pip row + earned-pill card placed above
  `PrimaryTabs` in `DogDetailsTabs`. One row per in-progress title
  track (element/level label, pip dots, Q count, last-Q date/show);
  completed titles as green Chip pills in a footer.
- `formatMonthDay()` added to `dateFormat.ts` for "Apr 12" formatting.
- 14 unit tests covering empty states, pips, labels, last-Q date,
  multi-sport, accessible aria-label.

### 5. Exhibitor "My entries at this show" + "Where to be & when" timeline — _landed_ (2026-04-24)

- `useShowEntriesForUser.ts` — new hook joining entry store + class store +
  dog store. Produces `allEntries` (sorted by date+time, for the timeline)
  and `dogGroups` (grouped by dog). Fields: element, level, classTitle,
  trialDate, dayLabel, startTime, judgeName, dogsAhead, hasResult, result.
  14 unit tests.
- `WhereToBe.tsx` — "Where to be & when" timeline card: day-grouped rows of
  [time | dog initial | dog · class | result/Upcoming chip | chevron]. 11
  unit tests.
- `DogEntriesSection.tsx` — per-dog block: avatar + name + class-count chip
  header, then entry rows (element icon square | class | meta | result/chip |
  link to class detail).
- `MyEntriesTab.tsx` — replaced old DataTable/LiveClassCard view with
  WhereToBe + DogEntriesSection. Summary count line above the timeline.

### 6. Class detail — before/after views — _landed_ (2026-04-24)

- `useMyEntriesInClass.ts` — hook that joins entry store + dog store to
  return the current user's entries in a single class with position,
  dogsAhead, and result data. 11 unit tests.
- `ExhibitorClassCallout.tsx` — mounts above `ClassDetailsMain` in
  `ClassDetailsPage`. Renders "Your dogs in this class" (before: position
  badge, ~N min estimate, "You're up next!" chip) or "Your results" (after:
  Q/NQ Chip, mono search time, faults, placement pill). Returns null when
  the user has no entries in this class. 11 unit tests.
- Score-sheet button deliberately omitted — judges keep paper scoresheets
  per DESIGN-NOTES "Not in v1".

### 7. Secretary My Shows — _landed_ (2026-04-24)

- `useMyShows.ts` — pure partitioning hook; takes filtered `Show[]` and
  returns `{ today, upcoming, draft, past, attentionNeeded }` buckets.
  Dates parsed as local midnight to avoid UTC-offset edge cases.
  18 unit tests.
- `ShowPhaseCard.tsx` — single card per phase; today (live chip + class
  stats), upcoming (entries-open/closed chip + days countdown + deadline
  warning), draft (amber chip + "Continue setup" CTA), past (compact
  name + "View" link). 13 unit tests.
- `MyShowsSection.tsx` — collapsible section header (phase dot + title +
  count) wrapping ShowPhaseCard list. Past shows start collapsed. 9 unit
  tests.
- `AttentionNeededStrip.tsx` — stacked card pinned above phase groups;
  urgent items (red icon) before info items; links to show detail.
  Returns null when empty. 5 unit tests.
- Wired into `SecretaryDashboardPage/index.tsx` — replaced `TodayHero`
  and `UpcomingShowsStrip` with the new components; class-stage stats
  from `useMissionControlData` forwarded to today cards.

### 8. Class Run Sheet — _landed_ (2026-04-24)

Check-in, scratch, run-order sort (custom/armband/random), inline result
entry (Q/NQ, time, faults, placement, judge notes), Start/Close class.
`SecretaryRunSheet` shown to secretary/admin; exhibitors see unchanged
`ClassDetailsMain`. PR [#83](https://github.com/rbeezley/myk9-platform/pull/83).

### 9. Auth / Settings polish, premium-list wizard, notifications, transactional emails — _last_

## Explicit non-goals

From DESIGN-NOTES "Not in v1":

- Mobile / tablet breakpoints
- Judge app / digital scoresheets
- Social login
- DMs / messaging between users
- Public (unauthenticated) results pages
- Payment refund flow
- Competition types other than Scent Work
- Bulk data import
- i18n

## Cadence

One shell or one high-value page per session. Each session: extend
existing components, verify in browser, unit-test new logic, commit,
stop. Copy fixes from the terminology cheat sheet get applied
opportunistically as each page is touched, not as a separate sweep.
