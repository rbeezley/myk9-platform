# myK9Show Redesign — Fall 2026

Picked up the 15-screen redesign package dropped into
`docs/designs/myK9show-redesign/myK9Show/`. This plan tracks what was
landed in the kickoff session and what remains.

## Source material

- `docs/designs/myK9show-redesign/myK9Show/HANDOFF.md` — build order
- `docs/designs/myK9show-redesign/myK9Show/DESIGN-NOTES.md` — locked decisions
- `docs/designs/myK9show-redesign/myK9Show/myK9Show Redesign.html` — visual canvas
- `.jsx` files — mockup implementations (read for copy / patterns, do not port line-for-line)

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

### 2. Browse row-card shell — _NEXT SESSION_

Extend existing Browse pages (`BrowseShowsPage`,`BrowseDogsPage`,
`BrowseClubsPage`, `BrowsePeoplePage`, plus Trials/Classes Browse) to
use a shared Direction-B row-card pattern:

- Cover/thumbnail on left, facts stack in middle, action buttons on
  right, all visible in a single row without a tap.
- Consumes the `--sidebar-w` / `--content-max` layout tokens.
- Extend `EntityCard` or `PageLayout` rather than creating a new shell.

Highest leverage — one change unlocks 6+ pages.

### 3. Unified Detail shell — _queued_

Hero + tabs pattern for Show / Dog / Club / Person detail. Extend
existing detail pages. Tabs are count-labeled (e.g. "Trials (3)").

### 4. Dog detail with rolling title progress — _queued_

"Novice Container — 2/3 Qs" with a 3-pip progress row. One row per
in-progress title track; completed titles render as a solid Chip.
Placed above the shows/results tab.

### 5. Exhibitor "My entries at this show" + "Where to be & when" timeline — _queued_

Single page, threads exhibitor flow end-to-end. Grouped by dog; top
timeline shows every class across the weekend.

### 6. Class detail — before/after views — _queued_

Two states, same page. "Your dogs in this class" callout → "Your
results" callouts post-class.

### 7. Secretary My Shows — _queued_

4 phase groups (Happening today / Upcoming / Draft / Past) + Attention
Needed strip. Extends existing dashboard — do not rebuild.

### 8. Class Run Sheet — _queued, multi-session_

The magic page: check-in + run order + inline result entry. Budget
2–3 sessions. Data flow is entries table only (see data-model section).

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
