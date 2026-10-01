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
| Clubs   | 1 (`ClubEditPanel` on `/clubs`)                                                      | club admin / site admin only (`clubPermissions.ts`)                                                   | site admin only                                                | A secretary who created a club cannot correct it — see Q2                                 |
| Shows   | 1 wizard, ~5 doors                                                                   | 1: `ShowEditPanel` via header Actions only                                                            | 2 (Show Edit panel, bulk bar)                                  | No visible Edit — see Q1                                                                  |
| Trials  | wizard `?mode=add-trials`                                                            | trial detail page only (`TrialEditPanel`)                                                             | trial detail page only                                         | Setup Trials rows only navigate (`TrialsTab.tsx:218,301`)                                 |
| Classes | **3 UIs**: wizard `?mode=add-classes`, `AddClassesToTrialPanel`, `ClassCreationPage` | `ClassEditPanel` (class detail, trial row menu) + inline status/judge in Class Management             | 3 (class detail, trial row menu, Class Management `confirm()`) | Three different create flows; Setup Classes rows only navigate (`ClassesTab.tsx:296,312`) |
| Entries | 1 wizard, ~4 doors                                                                   | **2 dialogs**: `components/entries/EntryEditDialog.tsx`, `pages/ClassDetailsPage/EditEntryDialog.tsx` | 3                                                              | Two editors that will drift                                                               |
| Dogs    | 2 (`/dogs`, inline in entry wizard)                                                  | 1                                                                                                     | owner / site admin only                                        | Fine                                                                                      |
| People  | 3 (`/people`, entry wizard, `JudgesPicker` in show wizard)                           | 1                                                                                                     | 1                                                              | Judge creation only inside the show wizard (`ShowEditForm.tsx:317` links out)             |

Mail-in entry for a brand-new owner and dog is already one inline flow (Entries → Add entry → "for someone else" → Create Exhibitor & Dog). No change needed.

## Phase 0 — Watch a real secretary (before code) ([MYK9-898](https://linear.app/myk9-platform/issue/MYK9-898))

MYK9-13 (real-user validation) was cancelled; every finding to date comes from code reading and AI persona walks. A 30-minute, no-hints session with a real secretary, around the Oct 10 UKC trial:

1. Create a show. 2. Add a mail-in entry for a new exhibitor. 3. Fix a typo in a class. 4. Move a dog up. 5. Check a dog in. 6. Print the catalog.

Record every pause and wrong click. Specifically record whether she finds the header **Actions** menu unaided — that answers Q1. Findings that contradict phases 1–5 change the plan before code does.

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

## Open questions (owner decisions)

- **Q1 — Visible Edit on the show page?** MYK9-630 put Edit show only in the header Actions menu, and "the same verb never appears in both places". Revisit only if Phase 0 shows she cannot find it.
- **Q2 — Club edit for secretaries?** A secretary can create a club but not edit it. Deliberate permission model or gap?

## Testing (every phase)

A phase is complete only when its tests pass.

- **Phase 1:** route test that the deleted class-creation URLs redirect; component tests that every "Add Classes" door targets the single flow (with trial focus); existing wizard add-classes tests green.
- **Phase 2:** component tests on `TrialsTab` / `ClassesTab` rows — menu opens the real edit panel and delete dialog, row click still navigates; Class Management delete uses the dialog (no `window.confirm`).
- **Phase 3:** render `ClassDetailsPage` on the real entry prop shape and assert it opens `EntryEditDialog` with every field the old dialog showed (LESSONS `last-hop-drop`).
- **Phase 4:** `DashboardQuickLinks` tests for 0 / 1 / many active shows.
- **Phase 5:** typecheck after deletion; judge-create test in Show Edit.
- **All:** `pnpm typecheck`, shuffled vitest for touched suites, `pnpm qa:code-quality-ratchet`, and one browser walk of the six Phase 0 tasks after Phases 1–4 ship.

## Non-goals

No new pages, no navigation restructure, no permission changes (Q2 is a question, not a task), no changes to the entry wizard flow itself.
