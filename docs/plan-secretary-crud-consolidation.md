# Secretary CRUD Consolidation — one way to do each thing

> **Status:** Active

**Linear:** [MYK9-897](https://linear.app/myk9-platform/issue/MYK9-897) · **Date:** 2026-10-01 · **Follows:** [`plan-secretary-show-actions.md`](plan-secretary-show-actions.md) (MYK9-630: six tabs, header Actions menu, placement rule)
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary — anti-pattern: "anything that makes the user feel like they need to learn the software".

## Why

The target user is an experienced show secretary who is not very computer literate. The page-level structure already matches how she thinks about a show (club → show → trial → class → entry = dog + person; Dogs and People as reference data), so this plan does **not** restructure navigation.

The remaining friction is at the object level: several of the seven core objects can be added, edited or deleted from two or three screens that work differently, and the Setup lists show trials and classes without letting her act on them. Two ways to do one thing is the "learn the software" anti-pattern.

## Inventory (2026-10-01, `origin/main` @ `187e6434c`)

| Object  | Add                                                                                  | Edit                                                                                                  | Delete                                                         | Problem                                                                                   |
| ------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Clubs   | 1 (`ClubEditPanel` on `/clubs`)                                                      | club admin / site admin only (`clubPermissions.ts`)                                                   | site admin only                                                | Creator is auto-granted club admin; client may hide Edit until reload — Phase 7           |
| Shows   | 1 wizard, ~5 doors                                                                   | 1: `ShowEditPanel` via header Actions only                                                            | 2 (Show Edit panel, bulk bar)                                  | No visible Edit — Phase 6                                                                 |
| Trials  | wizard `?mode=add-trials`                                                            | trial detail page only (`TrialEditPanel`)                                                             | trial detail page only                                         | Setup Trials rows only navigate (`TrialsTab.tsx:218,301`)                                 |
| Classes | **3 UIs**: wizard `?mode=add-classes`, `AddClassesToTrialPanel`, `ClassCreationPage` | `ClassEditPanel` (class detail, trial row menu) + inline status/judge in Class Management             | 3 (class detail, trial row menu, Class Management `confirm()`) | Three different create flows; Setup Classes rows only navigate (`ClassesTab.tsx:296,312`) |
| Entries | 1 wizard, ~4 doors                                                                   | **2 dialogs**: `components/entries/EntryEditDialog.tsx`, `pages/ClassDetailsPage/EditEntryDialog.tsx` | 3                                                              | Two editors that will drift                                                               |
| Dogs    | 2 (`/dogs`, inline in entry wizard)                                                  | 1                                                                                                     | owner / site admin only                                        | Fine                                                                                      |
| People  | 3 (`/people`, entry wizard, `JudgesPicker` in show wizard)                           | 1                                                                                                     | 1                                                              | Judge creation only inside the show wizard (`ShowEditForm.tsx:317` links out)             |

Mail-in entry for a brand-new owner and dog is already one inline flow (Entries → Add entry → "for someone else" → Create Exhibitor & Dog). No change needed.

## Phase 1 — One way to add classes ([MYK9-899](https://linear.app/myk9-platform/issue/MYK9-899))

Three create flows today. Default: keep the **show wizard's add-classes mode** (she learned it creating the show); point TrialDetailsPage "Add Classes" and Class Management "Add Classes" at it; delete `AddClassesToTrialPanel` and `ClassCreationPage` plus its two routes (`publicRoutes.tsx`, `secretaryRoutes.tsx`), with redirects for the old URLs.

**Precondition to verify first:** the wizard's `add-classes` mode takes no `trialId` today (`editModeResolution.ts`). Launched from a trial page it must open focused on that trial. If that cannot be done cleanly, flip the default and keep `AddClassesToTrialPanel` as the single flow instead. Either way, exactly one survives.

## Phase 2 — Edit and Delete on Setup rows ([MYK9-900](https://linear.app/myk9-platform/issue/MYK9-900))

Setup → Trials and Setup → Classes rows only navigate away. Add a row action menu (Edit, Delete) that opens the existing `TrialEditPanel` / `ClassEditPanel` and the existing delete dialogs — no new forms. This applies the MYK9-630 placement rule: an action that needs an item picked lives beside the item. Row click still opens detail. Replace Class Management's `confirm()` (`ClassManagementPage.tsx:227`) with the same `DeleteClassDialog`.

## Phase 3 — One entry editor ([MYK9-901](https://linear.app/myk9-platform/issue/MYK9-901))

Keep `components/entries/EntryEditDialog.tsx`; have `ClassDetailsPage` (and `MyEntriesDialogs` if it uses the same component — check) open it; delete `pages/ClassDetailsPage/EditEntryDialog.tsx`. Diff the two first and carry over anything only the class-page dialog does. Same audit for the three delete-entry paths: one dialog, reached from wherever the row is.

## Phase 4 — "Add Entry" on the secretary home ([MYK9-902](https://linear.app/myk9-platform/issue/MYK9-902))

`DashboardQuickLinks.tsx` offers Add Show / Add Dog / Add Person. Her most frequent pre-show task is keying mail-ins, and the entry flow already creates dogs and people inline. Replace Add Dog and Add Person with **Add Entry**: one active show → straight to `/secretary/register/:showId`; several → a simple show picker. Add Dog / Add Person remain on `/dogs` and `/people`.

## Phase 5 — Small consistency fixes ([MYK9-903](https://linear.app/myk9-platform/issue/MYK9-903))

- Delete `components/shows/ShowDetails/ShowMainCard.tsx` (no importers).
- Show Edit → Judges tab: allow creating a judge in place (reuse `JudgesPicker`'s `onCreateJudge`) instead of linking out to `/people`.

## Phase 6 — Visible "Edit show" button ([MYK9-904](https://linear.app/myk9-platform/issue/MYK9-904))

Owner decision (Richard, 2026-10-01): yes. Add a plainly labelled **Edit show** button to the show page header (`ShowManagementShell.tsx`), managers only, opening the existing `ShowEditPanel` (`?edit=true`). Edit stays in the header Actions menu as well, since the command palette reads that registry. This is a deliberate exception to MYK9-630's "the same verb never appears in both places" rule, made for discoverability by non-technical secretaries. Record it in `plan-secretary-show-actions.md` § Placement rule.

## Phase 7 — A secretary can edit a club they created ([MYK9-905](https://linear.app/myk9-platform/issue/MYK9-905))

Owner decision (Richard, 2026-10-01): yes. The server already allows it: `trg_grant_club_admin_to_club_creator` (20260511100000, kept on purpose by MYK9-572) makes the creator `club_admin` of the new club, and `clubs_update` admits `is_club_admin(clubs.id)`. The likely gap is client-side: `computeClubPermissions` reads role scopes that may not refresh after creating a club, so Edit could stay hidden until reload. Verify on staging; refresh scopes after club creation if needed. No permission model change.

## Phase 8 — Watch a real secretary (after phases 1–7) ([MYK9-898](https://linear.app/myk9-platform/issue/MYK9-898))

MYK9-13 (real-user validation) was cancelled; every finding to date comes from code reading and AI persona walks. Owner decision (2026-10-01): run this after phases 1–7 ship, as validation of the changes rather than discovery. A 30-minute, no-hints session with a real secretary:

1. Create a show. 2. Add a mail-in entry for a new exhibitor. 3. Fix a typo in a class. 4. Move a dog up. 5. Check a dog in. 6. Print the catalog.

Record every pause and wrong click. Specifically record whether she uses the new **Edit show** button (Phase 6), the Setup row menus (Phase 2) and **Add Entry** on the home page (Phase 4) unaided. Anything she trips on becomes a follow-up issue under MYK9-897.

## Decisions (resolved 2026-10-01)

- **Q1 — Visible Edit on the show page?** Yes → Phase 6.
- **Q2 — Club edit for secretaries?** Yes, for clubs they created → Phase 7 (already the server rule; verify the client).

## Testing (every phase)

A phase is complete only when its tests pass.

- **Phase 1:** route test that the deleted class-creation URLs redirect; component tests that every "Add Classes" door targets the single flow (with trial focus); existing wizard add-classes tests green.
- **Phase 2:** component tests on `TrialsTab` / `ClassesTab` rows — menu opens the real edit panel and delete dialog, row click still navigates; Class Management delete uses the dialog (no `window.confirm`).
- **Phase 3:** render `ClassDetailsPage` on the real entry prop shape and assert it opens `EntryEditDialog` with every field the old dialog showed (LESSONS `last-hop-drop`).
- **Phase 4:** `DashboardQuickLinks` tests for 0 / 1 / many active shows.
- **Phase 5:** typecheck after deletion; judge-create test in Show Edit.
- **Phase 6:** component test: Edit show visible for a manager, absent for an exhibitor, opens `ShowEditPanel`; 375px header check.
- **Phase 7:** staging check of the creator grant; test that Edit appears after club creation without reload; negative control for a non-creator secretary.
- **All:** `pnpm typecheck`, shuffled vitest for touched suites, `pnpm qa:code-quality-ratchet`, and the Phase 8 session itself as the end-to-end check.

## Non-goals

No new pages, no navigation restructure, no permission model changes (Phase 7 uses the existing creator = club admin rule), no changes to the entry wizard flow itself.
