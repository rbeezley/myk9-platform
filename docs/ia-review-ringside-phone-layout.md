# IA Review: Ringside phone screens

**Date:** 2026-11-04
**Auditor:** Claude
**Linear:** MYK9-1697
**Sources:** route audit (`apps/myk9show/src/routes/atShowRoutes.tsx`), code read of the class list, entry list and scoresheet, live measurement on myk9show.com as judge@myk9t.com (show "Heartland Scent Work Week") at 375×812 and 768×1024, the owner's report from the Nov 4 focus-day walk.
**Scope:** the three ringside screens a judge or steward walks every class: class list (`/at-show/:showId`), entry list (`/at-show/:showId/class/:classId`, and the combined A/B list), scoresheet (`…/score/:entryId`). Not in scope: the dog finder, setup sheet and leaderboard pages themselves, or any menu destination.
**Plan:** [`plan-ringside-phone-layout.md`](plan-ringside-phone-layout.md)

## Commitments this review must not break

| Commitment                                                                                                | Source                                                    |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Up is the only exit from ringside; arrow plus the parent's name, top left.                                | MYK9-1500, `ClassListUpButton.tsx`, `RingsideUpButton`    |
| The ringside menu is on the class list and entry list only, and is "a way to somewhere, never a way out". | MYK9-1508, `menu/RingsideMenu.tsx` INTENT                 |
| Menu destinations carry a "Back to ringside" bar that restores the scroll position.                       | MYK9-1508, `RingsideReturnBar`, owner walk 2026-11-04     |
| Judge: "invisible technology", largest targets, minimal scrolling. Scoring screen is calm.                | `docs/INTENT.md` § Judge                                  |
| The Score Confirmation dialog stays.                                                                      | `docs/INTENT.md` § Judge                                  |
| 48px targets for gloved taps; text never below 14px.                                                      | `docs/INTENT.md` § Accessibility, `AtShowClassRow` INTENT |
| A judge-only account sees Your ring as the picker, not the trial list again.                              | `AtShowClassListSections.tsx` INTENT                      |
| The offline readiness action renders in every branch of the class list.                                   | MYK9-203, `AtShowOfflineReadySlot`                        |
| An unknown entry count is never spelled as a zero.                                                        | MYK9-637, `AtShowClassRow` INTENT                         |
| In-ring indicator is amber, never Ring Green.                                                             | `AtShowClassRow` INTENT                                   |

Every finding below was checked against this table; none asks to change one of them.

## Step 1: Route Audit

**Surface scope:** ringside, one show.

| Route                                        | Purpose                                  | Target user           | Parent in IA        | Component                                   |
| -------------------------------------------- | ---------------------------------------- | --------------------- | ------------------- | ------------------------------------------- |
| `/at-show/:showId`                           | Pick a class (Your ring, or every trial) | Judge, steward, staff | Show page (Up)      | `AtShowClassListPage.tsx`                   |
| `/at-show/:showId/class/:classId`            | Run order, check-in, pick the next dog   | Judge, steward        | Class list          | `AtShowEntryListPage.tsx` → `EntryListPage` |
| `/at-show/:showId/class/:classIdA/:classIdB` | Same, for a combined A/B class           | Judge, steward        | Class list          | `AtShowCombinedEntryListPage.tsx`           |
| `…/class/:classId/score/:entryId`            | Time and score one dog                   | Judge                 | Entry list          | `AtShowScoresheetPage.tsx`                  |
| `/at-show/:showId/dogs`                      | Find a dog across the show               | Staff, exhibitor      | Class list (button) | `AtShowDogsPage.tsx`                        |
| `/at-show/:showId/setup-sheet`               | Printable judge setup cheat sheet        | Judge                 | Class list (button) | `AtShowSetupSheetPage.tsx`                  |

**Orphan routes:** none.
**Duplicate-purpose routes:** none. The duplication on this surface is in controls, not routes (Step 4).
**URL vs hierarchy:** matches (show › class › dog).

## Step 2: Task Flow Walk

Measured live at 375×812 unless stated. "Chrome" means everything above the first thing the user came for.

### Task 1: Open my class (judge)

| Step | Action                 | Route          | Friction                                                                                                                                                                                                                                            | Severity |
| ---- | ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1    | Land on the class list | `/at-show/:id` | First class card at **626/812px** (77% of the first screen is chrome): announcements bar 45, Up/refresh/menu row 48, two-line show title 64, offline status, Find a dog 44, cheat sheet 44, four tabs 48, search 48, sort 48, Your ring heading 44. | High     |
| 2    | Read the card          | same           | "Container Novice A" cut to 121/155px; the card's trial line "Trial 6 · Wed, Nov 4, 2026" cut to **54/201px**. The right column (status badge, count, chevron) takes ~190px of a 315px card.                                                        | High     |
| 3    | Read the tabs          | same           | "In Prog…", "Favorit…", "Compl…": four 83px tabs, 16px labels.                                                                                                                                                                                      | Medium   |
| 4    | Tap the card           | → entry list   | none                                                                                                                                                                                                                                                | None     |

At 768×1024 the first card sits at 528/1024 (52%) and nothing truncates: the problem is phone-width.

**Verdict:** completable with friction (one scroll before any class is visible).

### Task 2: Run the class (judge / steward)

| Step | Action                 | Route        | Friction                                                                                                                                                                                                                                                                          | Severity |
| ---- | ---------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1    | Land on the entry list | `/class/:id` | Header is **165px** at 375 (60 at 768): the class name block drops to its own row (`max-sm:basis-full`) and reserves two title lines even for a one-line name.                                                                                                                    | High     |
| 2    | Scroll the list        | same         | **The sticky header slides under the sticky announcements bar.** Both stick at `top: 0`; the bar is `z-40`, the header `z-10`. Scrolled, the Up button sits at 14–58px and a tap at its centre hits "Announcements, 2 unread". The one exit is covered whenever the list scrolls. | Critical |
| 3    | Look for an action     | same         | Three icon buttons side by side: Search & sort, ⋮ (Actions: Refresh, Set Run Order, Recalculate Placements, Class Options, Set Max Time) and ☰ (Ringside menu). Two overflow menus next to each other, with different icons and different panels (dropdown vs slide-out).        | High     |
| 4    | Refresh                | same         | Refresh is a header icon on the class list but an item inside ⋮ on the entry list.                                                                                                                                                                                                | Medium   |

The report's "Not checked in" / "Score <dog>" truncation was a measurement artefact: those are `sr-only` accessible names (clientWidth 1px), not visible text. Visible card text did not truncate.

**Verdict:** completable with friction; step 2 is a real defect (Up unreachable while scrolled).

### Task 3: Score a dog (judge)

| Step | Action              | Route             | Friction                                                                                                                                                                                                                    | Severity |
| ---- | ------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1    | Open the scoresheet | `/score/:entryId` | The announcements bar (44px) is still on screen. INTENT asks for a calm scoring screen; a tappable unread badge above the timer is the opposite.                                                                            | High     |
| 2    | Check the dog       | same              | Header lines truncate at 375: "Handler: Casey Morgan" in 101/186px, "Container Novice A · Judge Pat Donovan" in **64/288px**, and the date/trial heading squeezed to 29px. At 768 the class line still truncates (267/288). | Medium   |
| 3    | Score and save      | same              | none: Cancel/Save sit at the bottom as the sheet's own actions (not navigation). Targets 48px.                                                                                                                              | None     |

**Verdict:** completable; header is noisy and cut off.

## Step 3: Mental Model Check

**Method used:** product owner (the Nov 4 report and walk) plus domain convention (v3 ringside, which the owner and judges know).

**Capabilities:**

- Go back up a level (Up)
- Go somewhere else in the show: announcements, results, show info, settings, help, sign out (☰)
- Find a dog; open the judge cheat sheet
- Keep this device ready offline ("Save for show day")
- Refresh from the server
- Narrow the list: status tabs, search, sort
- Act on one class: favorite, details, class options
- Act on the class I'm in: run order, max time, class options, recalculate placements
- Score one dog

**User mental grouping (owner's words: "one predictable place for navigation and one for actions"):**

- **Top left:** where am I, and up.
- **Top right, one button:** everything else I can go to or do here.
- **The list:** the things I came for, as high on the screen as possible.
- **On a row:** actions on that row only.

**Actual grouping:**

- Top row: Up, refresh, ☰ (class list); Up, filter, ⋮, ☰ (entry list); Up, mute (scoresheet).
- Full-width stacked buttons in the page body: Find a dog, Judge setup cheat sheet, Save for show day.
- A sticky announcements bar above every screen, duplicating ☰ › Announcements.
- Per-card footer: info, heart, ⋯.

**Mismatches:**

| Capability                 | User expects in     | Actually lives in                                 | Severity |
| -------------------------- | ------------------- | ------------------------------------------------- | -------- |
| Announcements              | ☰ (with its badge) | ☰ **and** a sticky bar on all three screens      | High     |
| Find a dog, cheat sheet    | ☰ (places to go)   | Stacked full-width buttons in the class list body | High     |
| Class actions (entry list) | One top-right menu  | ⋮ beside ☰ (two menus)                           | High     |
| Refresh                    | One place           | Header icon (class list) vs inside ⋮ (entry list) | Medium   |

## Step 4: Duplication & Orphan Scan

**Task duplication:**

| Task                               | Paths available                                                                                                       | Recommended consolidation                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Read announcements                 | Sticky bar (inline feed) on every ringside screen; ☰ › Announcements (Message Center, same store, same unread count) | Delete the bar; keep its store subscription so ☰'s badge stays live.                                             |
| Open an overflow menu (entry list) | ⋮ dropdown; ☰ slide-out                                                                                              | One button. ⋮'s class actions become a "This class" group at the top of ☰ on the entry list.                     |
| Refresh                            | Class list header icon; entry list ⋮ item                                                                             | One rule for both lists (decision D3).                                                                            |
| Class options                      | Class list card ⋯; entry list ⋮ › Class Options                                                                       | Keep both: the card ⋯ acts on that row from the list, ⋮ acts on the class you are in. Not a duplicate of purpose. |

**Orphan routes:** none.
**Modal/inline duplications:** the announcements bar is an inline copy of the Message Center's Show messages tab.

## Step 5: Severity Scoring

| #   | Finding                                                                                    | Step | Freq | Friction | Invasiveness | Sum | Priority      |
| --- | ------------------------------------------------------------------------------------------ | ---- | ---- | -------- | ------------ | --- | ------------- |
| F1  | Entry list: sticky header slides under the announcements bar; Up is covered while scrolled | 2    | 5    | 4        | 1            | 10  | High (defect) |
| F2  | Class list: first card at 626/812 (77% chrome)                                             | 2    | 5    | 3        | 2            | 10  | High          |
| F3  | Announcements bar duplicates ☰ › Announcements and sits above the scoring screen          | 3, 4 | 5    | 2        | 1            | 8   | High          |
| F4  | Entry list: two overflow menus side by side (⋮ and ☰)                                     | 3, 4 | 5    | 3        | 3            | 11  | Critical      |
| F5  | Class card: name and trial line truncate because the right column takes 60% of the card    | 2    | 5    | 3        | 2            | 10  | High          |
| F6  | Entry list header is 165px at 375 (title on its own row, two lines reserved)               | 2    | 5    | 2        | 2            | 9   | High          |
| F7  | Find a dog / cheat sheet stacked as full-width body buttons                                | 3    | 4    | 2        | 1            | 7   | Medium        |
| F8  | Status tab labels truncate ("In Prog…", "Favorit…", "Compl…")                              | 2    | 5    | 2        | 1            | 8   | High          |
| F9  | Scoresheet header lines truncate (handler, class/judge, trial date)                        | 2    | 5    | 2        | 2            | 9   | High          |
| F10 | Refresh lives in a different place on each list                                            | 3    | 3    | 1        | 1            | 5   | Medium        |
| F11 | Search and sort stack on two rows at phone width (`flex-col` below `sm`)                   | 2    | 5    | 1        | 1            | 7   | Medium        |

(Invasiveness scored inverse per the rubric: 1 = one small change.)

**Top to fix in the next phase:** F1, F2, F3, F4, F5, F6, F8, F9.
**Documented, cheap enough to fold in:** F7, F10, F11 (each is a few lines and lands with the phase that touches the same component).

## Step 6: Phased Remediation Plan

**Plan doc:** [`plan-ringside-phone-layout.md`](plan-ringside-phone-layout.md)

| Phase | Scope                                                                                                              | Entry trigger          | Exit criterion                                                                   | PRs                           |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------- | ----------------------------- |
| A     | One top bar per screen; delete the announcements bar (F1, F3, F10)                                                 | Owner decisions D1, D3 | Up reachable at every scroll position on all three screens; no bar on scoresheet | 1 (one PR for A–C, MYK9-1697) |
| B     | Class list: fold body buttons into ☰, one-row search+sort, full-width card text, tab labels (F2, F5, F7, F8, F11) | D2, D4, D5             | First card in the top half at 375; no truncation for the seeded show             | same                          |
| C     | Entry list: one menu, one-row sticky bar; scoresheet header wraps (F4, F6, F9)                                     | D6, D7                 | Sticky chrome ≤15% of 812; no truncated scoresheet line                          | same                          |
| D     | Verify: before/after at 375 and 768, axe, 48px sweep, tests                                                        | A–C on the branch      | Acceptance criteria on MYK9-1697 all checked                                     | same                          |

---

## Summary

**Overall IA health:** Needs work at phone width; tablet is acceptable.
**Top 3 findings:**

1. F4: two overflow menus side by side on the entry list — Critical
2. F1: the entry list's sticky header slides under the announcements bar, covering Up — High (defect)
3. F2: the class list spends 77% of the first phone screen on chrome — High

**Recommended next phase:** A (one top bar, delete the announcements bar), which also removes F1 outright.
**Total estimated remediation effort:** one PR (MYK9-1697), four phases inside it.
