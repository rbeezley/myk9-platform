# Ringside phone layout: one top bar, the list first (MYK9-1697)

> **Status:** Active

Findings: [`ia-review-ringside-phone-layout.md`](ia-review-ringside-phone-layout.md) (F1–F11). Linear: MYK9-1697.

## Goal

On a 375px phone the first screen is mostly the thing the user came for, every heading reads in full, and each screen has one place for navigation (top left: Up) and one for everything else (top right: ☰). Tablet keeps working as it does today.

## Duplication question

_Does this duplicate an existing page?_ No. It adds no page, sheet or control. It deletes one surface (the sticky announcements bar, an inline copy of ☰ › Announcements) and one control (the entry list's ⋮, whose items move into ☰), and moves three body buttons into the existing menu.

## Fixed constraints (not up for decision)

- Up stays top left, arrow plus parent name, the only exit (MYK9-1500).
- ☰ keeps every MYK9-1508 destination and the Back to ringside bar with scroll restore. The scoresheet still has no ☰.
- Score Confirmation stays. Scoresheet Cancel/Save stay where they are.
- 48px targets, 14px text floor, offline readiness action in every class-list branch (MYK9-203), unknown counts never shown as zero.

## Owner decisions

Asked one at a time; answered by the owner 2026-11-04. D1–D6 and D8 took the recommendation. **D7 did not:** the owner chose to pin the top bar **plus one class-name line** (about 100px, 12%); the name wraps rather than clamps, and the trial line scrolls away.

| #   | Question                                                                      | Recommendation                                                                                                                                           | Answer |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D1  | The sticky Announcements bar above every ringside screen                      | Delete it. ☰ › Announcements opens the same Message Center with the same unread count, and ☰'s badge already shows it. Keeps the scoresheet calm.      | Recommended ✓ |
| D2  | Find a dog and Judge setup cheat sheet (full-width buttons in the class list) | Move both into ☰, under the MYK9-1508 items' "places to go" rule (with the return bar).                                                                 | Recommended ✓ |
| D3  | Refresh (header icon on classes, inside ⋮ on entries)                         | Header icon on both lists, same spot, just left of ☰.                                                                                                   | Recommended ✓ |
| D4  | Status tabs truncate ("In Prog…", "Compl…")                                   | Rename to Pending · Running · Favorites · Done, sized to their words.                                                                                    | Recommended ✓ |
| D5  | Class card text truncates                                                     | Move the status badge and the scored count down into the card's footer row beside the progress bar, so name and trial line use the full width.           | Recommended ✓ |
| D6  | Entry list has ⋮ and ☰ side by side                                          | Delete ⋮. Its items (Set Run Order, Class Options, Set Max Time, Recalculate Placements) become a "This class" group at the top of ☰ on the entry list. | Recommended ✓ |
| D7  | Entry list header is 165px and sticky                                         | Only the top bar (Up, filter, refresh, ☰: ~68px, 8%) stays pinned; the class name and trial line sit under it and scroll away.                          | Bar + one-line name |
| D8  | Acceptance criteria                                                           | Confirm MYK9-1697's draft criteria as written, with "sticky chrome ≤15%" measured on the entry list and the scoresheet.                                  | Recommended ✓ |

No decision is needed for: one-row search + sort at phone width (F11), show name on one wrapping line, and scoresheet header lines wrapping instead of truncating (F9). Those follow from the goal and touch no commitment.

## Phases

### Phase A — one top bar per screen (F1, F3, F10)

- `AtShowAnnouncementFeed`: keep the store subscription, render no bar (D1). Rename to say what it now does.
- Class list, entry list, scoresheet: one top row, Up left, actions right, same height (48px targets, 60px bar).
- Refresh in the same spot on both lists (D3).

**Exit:** at every scroll position on all three screens, a tap on Up's centre hits Up (elementFromPoint test); no announcements bar on the scoresheet.

### Phase B — class list (F2, F5, F7, F8, F11)

- Find a dog and cheat sheet become ☰ items via `ringsideMenuExtensions`/`buildRingsideMenuItems`, keeping each one's existing role gate (`AtShowDogsLink`, `AtShowSetupSheetLink`) (D2). The stacked buttons are deleted.
- Show name: one `h1` line under the bar, wraps, smaller; offline readiness on the same line or directly under it, compact.
- Search and sort on one row at all widths.
- Tabs renamed and content-sized (D4).
- Card: badge and count to the footer row (D5); name, trial line, judge get the full width.

**Exit:** first class card top ≤406px at 375×812 for judge@ on the seeded show; zero truncated visible text in `main` at 375 (script below).

### Phase C — entry list and scoresheet (F4, F6, F9)

- `EntryListHeader` (packages/ringside): ⋮ removed; the host passes the class actions into `RingsideMenu` as a "This class" group (D6). Long-press hard refresh stays on the refresh icon.
- Sticky region = the top bar plus one class-name line (D7, owner choice); the name wraps instead of clamping and the trial line scrolls away. The name still opens the class details popover.
- `ScoresheetHeader` (packages/scoring-ui): lines wrap; class, judge, date and trial on one wrapping line.

**Exit:** sticky chrome ≤122px (15% of 812) on the entry list and the scoresheet at 375; ⋮ absent; every former ⋮ action reachable in ≤2 taps from ☰.

## Testing (Phase D)

1. **Unit / component (vitest, shuffled):** `ringsideMenuItems` lists the new items per role and keeps every MYK9-1508 item; `RingsideMenu` renders the "This class" group only when actions are passed and each fires its handler; `EntryListHeader` has no Actions menu and the sticky element contains only the bar; class card shows badge/count in the footer; tabs carry the new labels; announcement subscription still runs with no bar rendered. Update the existing tests that pin the removed controls, checking each with `git log -S` first.
2. **Geometry (real browser, both widths, judge@ on the seeded show):** a measurement script records first-card top, sticky-chrome height, truncated visible elements (`scrollWidth > clientWidth`, excluding `sr-only`), and the elementFromPoint Up check after scrolling. It prints a known-answer check (a deliberately truncated probe element) with its results.
3. **axe** on the three screens at both widths; **48px sweep** (`MYK9_MEASUREMENT_SWEEP=1`) shows no new sub-44px control.
4. **Before/after screenshots** at 375×812 and 768×1024 for all three screens, attached to the PR.
5. Repository gates: `pnpm typecheck`, lint, `pnpm qa:code-quality-ratchet`, package rebuilds (`@myk9/ringside`, `@myk9/scoring-ui`), review gate per CLAUDE.md.
