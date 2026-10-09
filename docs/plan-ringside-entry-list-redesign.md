# Ringside entry list redesign (option G)

> **Status:** Active

Tracking: [MYK9-1086](https://linear.app/myk9-platform/issue/MYK9-1086/redesign-the-at-show-entry-list-cards-option-g-in-ring-and-up-next)

The `/at-show/:showId/class/:classId` entry list, redesigned around who actually reads it. Design reference: the **G** row of the "Ringside entry cards" canvas (`https://claude.ai/artifact/MR1V69oSJbzEED8pR5pD9a`): boards _G · Exhibitor watching_, _G · Judge's timer_ and _G · Completed_.

## Who the page is for

- **People watching the ring** (exhibitors, stewards, anyone waiting): who is in the ring, who is next, where their own dog falls, and who hasn't shown up yet.
- **The judge's timer**: taps a dog and leaves for the stopwatch page. On this page they only need to find the dog fast — almost always the "Up next" dog.

## Duplication check

This reworks an existing page; it adds no new surface. It **deletes** four things from the card: the large Score/Resume button, the top-right status badge, the heart, and the gold/silver/bronze left accent bars. Everything they did either moves (status, favorites) or is already covered (tapping the row opens scoring).

## Decisions (owner, 2026-10-09)

1. **Pending tab layout:** an "In the ring" hero card, an "Up next" card, then a single-column list of the rest. No two-column tile grid on a phone — a grid hides the running order.
2. **No run-order numbers** ("5th", "6th") anywhere on the Pending tab: they read as placements. "In the ring" / "Up next" labels carry no ordinal either.
3. **Each dog shows** a square armband badge, call name, breed, and handler name on its own line (so people know whom to look for when a dog is missing).
4. **Own dogs** (the signed-in owner/handler's entries) get a tinted row and a small "Your dog" tag. No "your dog" summary card at the top of the page. The existing dogs-ahead pill (`OwnDogQueuePill`, INTENT 2026-06-11: the in-ring dog is not counted) stays, placed **under the check-in icon** in the row's right-hand column, since that column now holds only an icon. Its text is unchanged: `formatDogsAheadInList` ("You're next", "1 dog ahead", "3 dogs ahead").
5. **Check-in status as icons**: checked in = green check circle, not checked in = grey dashed circle, both with no words. Rarer states pair an icon with a word (At gate, Come to gate, Conflict, Pulled). Every icon carries an accessible label.
   **The icons come from the shared `StatusIcon` set, not a list-only set (owner, option 1).** Today `@myk9/ui`'s entry grammar draws by phase only, so `checked-in`, `at-gate` and `in-ring` render the same blue in-progress glyph and cannot be told apart without words. The shared set gains a distinct glyph per day-of check-in status, and the list, the check-in dialog and every other `StatusIcon family="entry"` caller get them together.
6. **Who can change check-in status:** steward, judge, and the dog's own owner/handler. Everyone else sees the icon read-only.
7. **Keep the Pending / Completed tabs** with those labels.
8. **Completed tab rows:** placement badge in **ribbon colours by registry**, time on the right, faults under the time **only when there is at least one**. NQ, excused and absent rows show only their reason — no time, no faults.
9. **Progress** in the header ("2 of 10 scored" plus a thin bar).
10. The timer's view keeps a "Resume" on the in-ring hero and a "Time" action on the Up next card; every other row is one tap target.
11. **"Follow this dog" replaces the heart.** Owners, co-owners and handlers are already alerted about their own dogs without favoriting anything (`push-trigger-run-proximity` resolves them from the entry, and the code keeps them alerted even when the favorites query fails). Favorites only add dogs a person does _not_ own, so that ability moves off the card into a per-dog menu instead of being deleted. The storage and push path stay exactly as they are (`ringsideDogFavorites` → `dogFavoritesSync` → `dog_favorites`); only the control moves and the word changes from favorite to follow.

### Ribbon colours

| Place | AKC    | UKC    | ASCA            |
| ----- | ------ | ------ | --------------- |
| 1st   | Blue   | Blue   | Blue (as AKC)   |
| 2nd   | Red    | Red    | Red (as AKC)    |
| 3rd   | Yellow | Green  | Yellow (as AKC) |
| 4th   | White  | Yellow | White (as AKC)  |

Sources: UKC — official 2019 Conformation Rulebook (rally/obedience forum quote agrees; nosework rule not found). AKC — secondary sources citing Rules Applying to Dog Shows ch. 5 §2; confirm against the AKC Scent Work regulations. ASCA — no source found; owner decision 2026-10-09: use the AKC colours. White needs an outline, yellow needs dark text.

## Current code (verified 2026-10-09)

All in `packages/ringside/src/pages/EntryList/` unless noted.

| Concern          | Where                                                                                                                             | Today                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card             | `SortableEntryCard.tsx` (480 lines), `components/DogCard.tsx`                                                                     | Armband, name, breed, handler, primary Score/Resume button, top-right `StatusBadge` (a button that opens check-in), heart, drag handle, `ResetButton` for scored dogs                       |
| Status tap rule  | `SortableEntryCard.tsx:156-207`                                                                                                   | Tappable when `hasPermission('canCheckInDogs') \|\| classInfo.selfCheckin`                                                                                                                  |
| Role permissions | `packages/ringside/src/auth/passcodes.ts`                                                                                         | `canCheckInDogs` is true for admin, judge, steward **and exhibitor** — any exhibitor can change any dog                                                                                     |
| Own dogs         | `dogsAheadInList.ts` (`EntryListOwnership`), passed in by the myK9Show host                                                       | `isOwnEntry` tint, `OwnDogQueuePill` ("4 dogs ahead", INTENT 2026-06-11), `OwnDogConflictChip`                                                                                              |
| Run order        | `runQueue.ts` (`pendingByRunOrder`, `isInRingEntry`)                                                                              | The one ordering rule (memory: run-queue canonical)                                                                                                                                         |
| Tabs             | `entryListTabs.tsx`                                                                                                               | Pending / Completed with host-supplied counts                                                                                                                                               |
| Results          | `SortableEntryCardComponents.tsx` (`PlacementBadge` with medal emoji, `RegularResultBadges`), `DogCard.tsx` placement accent bars | Entry carries `placement`, `resultText`, `searchTime`, `faultCount`, `nqReason`, `excusedReason` and the visibility flags `showPlacement` / `showQualification` / `showTime` / `showFaults` |
| Favorites        | `pageProps.ts` `EntryListFavorites`; host `apps/myk9show/src/features/at-show/dogFavoritesSync.ts`                                | Heart toggles a favorite armband that **drives push-notification fanout**                                                                                                                   |
| Layout           | `components/EntryListContent.tsx`                                                                                                 | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, dnd-kit sortable for run-order changes                                                                                                         |
| Registry         | not in ringside                                                                                                                   | Host resolves it with `getTrialRegistry` (`@/features/registries`)                                                                                                                          |

## Phases

### Phase 1 — Data and rules (no visual change)

1. Add `registry?: 'AKC' | 'UKC' | 'ASCA'` to the entry-list `ClassInfo` contract; the myK9Show host fills it via `getTrialRegistry`, never raw columns.
2. `ribbonColors.ts`: registry + placement → `{ background, text, outline }`. Unknown registry or place > 4 → neutral badge.
3. `canChangeCheckIn(entry, ctx)`: `true` for steward / judge / admin permission holders; `true` for an exhibitor only when `ownership.ownEntryIds.has(entry.id)` and the class allows self check-in (owner: when a class turns self check-in off, owners cannot change their dog's status); otherwise `false`. Requires separating "staff can check in any dog" from the exhibitor's own-dog right, since `canCheckInDogs` is currently true for exhibitors.
4. **Shared check-in glyphs** in `packages/ui/src/components/StatusIcon/` (`statusIconGrammar.ts`, `StatusIcon.tsx`): add an optional `glyph` to `StatusDescriptor`, used instead of the phase `shape` when present. Entry family, day-of statuses only:

   | Status         | Glyph                    | Colour class            | Word on the list row |
   | -------------- | ------------------------ | ----------------------- | -------------------- |
   | `no-status`    | dashed circle (existing) | `text-muted-foreground` | no                   |
   | `checked-in`   | check in a circle        | `text-success`          | no                   |
   | `at-gate`      | gate                     | `text-warning`          | yes, "At gate"       |
   | `come-to-gate` | bell                     | `text-warning`          | yes, "Come to gate"  |
   | `conflict`     | warning triangle         | `text-destructive`      | yes, "Conflict"      |
   | `pulled`       | slashed circle           | `text-muted-foreground` | yes, "Pulled"        |
   | `in-ring`      | target / ring            | `text-info`             | shown in the hero    |
   | `completed`    | finish flag              | `text-success`          | Completed tab        |

   `checked-in` takes over the circle-and-check (today's entry `complete` glyph), so `completed` moves to a finish flag in the entry family; other families keep the circle-and-check for complete. Distinctness is enforced: a test asserts no two day-of statuses share glyph + colour. Every other family and every non-day-of entry status keeps its phase shape. Labels move to sentence case ("Checked in", "At gate", "Come to gate", "In ring"), and `no-status` reads **"Not checked in"** in the entry family; grep the 38 `family="entry"` callers and their tests for the old strings before changing them. A `checkInPresentation(status)` helper only adds the "show the word on the row?" flag on top of the shared descriptor, with a fallback for unknown values (memory: status-map lookup crash).

5. **Check-in dialog refresh** (`apps/myk9show/src/features/at-show/slots/CheckinStatusDialog.tsx`; board _G · Check-in dialog_):
   - Title "Change check-in" (sentence case), with a close (X) in the header instead of a Close button in the footer.
   - Dog block matches the row: square armband badge, call name, breed, handler.
   - Options in the order a dog moves through the day: Not checked in, Checked in, At gate, Come to gate, then Conflict, Pulled; staff-only In ring and Completed after a divider labelled "Steward and judge only".
   - The dog's current status is marked ("Current") and is not a no-op button; this needs the current status on `CheckinStatusDialogProps`' `dogInfo` if it is not already there.
   - Each option uses the same shared glyph as the list, so the dialog doubles as the icon key for anyone unsure what an icon means.
   - One tap saves and closes, as today (no confirm — judge/steward INTENT: no "are you sure?").

### Phase 2 — Pending tab

1. `NowAndNext` block above the list: hero from `isInRingEntry`, Up next = first of `pendingByRunOrder`. Both tappable for scorers (`canScore && !scoringDisabled`); display-only otherwise. When no dog is in the ring, the hero slot stays and shows a slim dashed "Ring is clear / Waiting for the next dog" placeholder (board _G · Pending, no dog in the ring_), so Up next never jumps as dogs enter and leave. With no pending dog left, the Up next card is not shown.
2. New `EntryRow` replacing the card body for this page: armband square, name (+ A/B section tag in combined mode, + "Your dog" tag), breed line, handler line, check-in icon on the right. Whole row → `handleEntryClick` for scorers. The status icon is its own button only when `canChangeCheckIn`; otherwise plain, so a judge's row tap and a status tap never share space ambiguously.
3. Remove the Score/Resume button, the corner badge, the heart and the accent bars from this page.
4. Phone: single-column list. Tablet (from `md`): two columns of rows, running order reading **left to right, then the next row** (owner decision). The hero and Up next span both columns. dnd-kit's `rectSortingStrategy` already orders that way.
5. Drag mode (long-press, `canChangeRunOrder`) keeps working: in drag mode render the plain list (no hero/next) with the existing grip handle.
6. Header progress line and bar from the host's status counts.
7. **Follow this dog.** For a viewer who cannot score, tapping a row (outside the status icon) opens a small menu for that dog with **Follow this dog** / **Stop following**, wired to the existing `favorites.onToggleFavoriteArmband`. A followed dog shows a small bell icon after its name. Rules:
   - Not offered on the viewer's own dogs (they are already alerted; the menu would promise nothing new).
   - Not offered when the entry has no armband (favorites are keyed by armband).
   - Signed-out / passcode viewers: following still works on this device, and the menu says alerts need a signed-in account, because local favorites never reach the push job.
   - Scorers (judge / timer) do not get the menu on this page: their row tap goes straight to scoring, and the page must not add a step in front of it.
   - It is a decision menu of one or two items, so it uses the app's small popover/dialog pattern (`docs/INTENT.md`, Dialog or Slide-Out), not a new sheet or page.

### Phase 3 — Completed tab

1. `ResultRow`: ribbon placement badge (only when `showPlacement`), armband square — brand colour for Q, grey otherwise (only when `showQualification`), then call name, breed and handler on three lines — the same layout as the Pending row.
2. Right column: Q → time (`showTime`), then "1 fault" / "N faults" only when `faultCount > 0` (`showFaults`). NQ → `nqReason`; excused → "Excused" (+ `excusedReason` if present); absent → "Absent". Never time or faults on those.
3. Sort: placements, other Q, NQ, excused, absent — unless `ClassCompletionPresentation` already defines an order; match it rather than adding a second rule.
4. Keep the scorer's reset action on scored rows (move `ResetButton` into a row overflow menu).
5. Retire `PlacementBadge` emoji and `getPlacementEmoji` once nothing references them (check Nationals badges first).

### Phase 4 — Testing (phase is not complete until these pass)

- Assertion-first unit tests: `canChangeCheckIn` (steward, judge, own exhibitor → true; other exhibitor, anonymous / passcode exhibitor, own dog with self check-in off → false); `ribbonColors` (AKC 3rd = yellow, UKC 3rd = green, unknown → neutral); `checkInPresentation` covers every `CHECKIN_STATUSES` value; `StatusIcon` renders the new glyph for each day-of status and no two day-of statuses share glyph + colour; the dialog lists options in the new order, shows staff-only options only with `showRingManagement`, and marks the current status.
- Component tests with the custom render: hero/Up next pick the right dogs from `runQueue`, and an empty ring renders the "Ring is clear" placeholder in the hero slot; a non-scorer tapping a row does nothing; status icon is a button only for permitted viewers; own-dog row shows the tint, the tag and the dogs-ahead text under the check-in icon (and none on other rows); Follow menu toggles the armband through `onToggleFavoriteArmband`, is absent on own dogs, on armband-less entries and for scorers, and shows the bell on followed dogs; Completed rows hide time/faults for NQ, excused and absent and hide each field when its `show*` flag is false.
- Update the existing card tests (`SortableEntryCard*.test.tsx`, `EntryListContent.test.tsx`) and grep `apps/myk9show/src/test/e2e` and `e2e/` for Score/Resume and status-badge locators before deleting them.
- Rebuild `@myk9/ringside`, run the app suite shuffled, `pnpm typecheck`, `pnpm qa:code-quality-ratchet` (new components go in sibling files; `SortableEntryCard.tsx` must not grow).
- Browser walk at 390 px and 768 px as judge, steward and exhibitor (own dog and someone else's), offline included; screenshots in the PR.

## Non-goals

The stopwatch/scoresheet page, the class list page, Nationals result badges, any change to how run order or placements are computed.

## Resolved owner questions (2026-10-09)

- Favorites → decision 11. Dogs-ahead pill → decision 4.
- Self check-in off → owners cannot change their own dog's status; only steward, judge and admin can.
- Passcode (account-less) exhibitors → lose check-in; they have no ownership to check against.
- Tablet → two columns, left to right then the next row.
- ASCA ribbons → same as AKC.
