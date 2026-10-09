# Core-Object UI Consistency

> **Status:** Active

**Date:** 2026-10-01 · **Evidence:** [`audits/2026-10-01-core-object-consistency-audit.md`](audits/2026-10-01-core-object-consistency-audit.md) (finding ids H1–H16, M1–M18 below refer to it) · **Sibling:** [`archive/plan-crud-standard.md`](archive/plan-crud-standard.md) (Edit and Delete placement and delete behavior; not repeated here).
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary. The target user is experienced but older and not very computer literate. A screen that behaves differently from the last one makes her stop and doubt.

## Owner decisions (2026-10-01)

1. **Create verb:** "Add ‹Object›", Title Case, everywhere (Add Club, Add Show, Add Trial, Add Classes, Add Entry, Add Dog, Add Person).
2. **Entry vocabulary:** entering a dog in a show is an **Entry** everywhere ("Enter a show", "My Entries", "Add Entry"). **Registration** means only a dog's AKC, UKC or ASCA registry record.
3. **Person:** "Person" everywhere outside admin and account screens ("Add Person", "Edit Person"; no "User" or "Exhibitor" record names). There is one create form, used from People and from the entry flow. Email is optional.
4. **Table tools:** a table shows only search, the view toggle and the result sentence. Export moves into the bulk bar. Density controls are removed (one comfortable row size). Columns and Reset view are hidden.
5. **Back from a tab:** leaves the page. Tab changes replace history, they do not push it.
6. **Empty values:** a field the secretary should fill shows "Not set" in muted text. An optional blank field is hidden. Table cells use "—".
7. **Official roles:** "Secretary" and "Chair" in the UI. "Trial Secretary" and "Show Chairman" appear only on official AKC documents.
8. **Default list view:** table for staff lists (Managing shows, trials, classes, entries, people, clubs). Cards for exhibitor and public lists (Find Shows, My Dogs). Her own choice is remembered on every list (`useViewPreference`).
9. **Premium tab:** "Premium" (the show edit tab currently says "Experience").
10. **Save confirmation:** always. "‹Name› saved" after an edit, "‹Name› added" after a create, on every path.
11. **Detail layout:** one page width (`PageShell`) and one shared header (`DetailHero`: title, status badge, facts row; no action buttons, because page actions live only in the header Actions menu, per `archive/plan-crud-standard.md` decision 5) for every detail page. This includes a calmer Person header.
12. **Class lists:** merge Class Management into Setup → Classes. Judge assignment and bulk status move into the Setup tab; the Class Management route becomes a redirect to it. One concern, one page.
13. **Add panels walk every tab** (2026-10-01). In create mode, a panel with tabs shows **"Next: ‹tab name›"** as its primary button on every tab but the last; only the last tab shows **"Add ‹Object›"**.
    - **Validation:** Next checks the current tab's required fields first. If one is missing, the panel says which and stays on that tab.
    - **Going back:** earlier tabs stay clickable for review; skipping ahead is not allowed. Cancel is on every tab.
    - **Edit mode is unchanged:** Save is available on every tab.
    - **Applies to:** Add Person (4 tabs), Add Club (3; this replaces today's always-enabled demoted "Create Club"), Add Dog (3), and any other tabbed Add panel. Add Show and Add Entry are already step wizards.

### Duplicate-actions decisions (2026-10-01)

These come from [`audits/2026-10-01-duplicate-actions-audit.md`](audits/2026-10-01-duplicate-actions-audit.md). Every action has one home; every other entry point is a link, a justified show-day fast path, or deleted, as the audit's table says.

14. **Show-day add entries:** the "Add entries" / "Add late entry" tool stays on the show-day screens as a fast path. Its labels match the Actions menu.
15. **Cancel show and Close out show:** both go in the Actions menu, status group. Cancel opens one flow that includes Refund all entries. The bulk "Mark Completed" / "Mark Cancelled" buttons and the Edit panel's status dropdown are removed. The status pill becomes a read-only chip.
16. **Status banners keep their button** ("Finish payment", "Premium not published", the Overview publish cards). A banner names a problem and offers its one fix. The same action is also in the Actions menu.
17. **Ring result words** (revised 2026-10-01). Results keep the registry's words **Absent** and **Excused**. "Withdrawn" is removed as a ring result choice, because a withdrawal is decided before the class, not in the ring. A Pulled or Withdrawn entry gets the result Absent automatically, from its entry status, and the screen shows the reason in plain words: "Absent · Pulled" or "Absent · Withdrawn (In season)". The judge or steward never chooses between them. Pull and Withdraw stay entry decisions only. Verify the result codes against the AKC, UKC and ASCA rulebooks before building.
18. **Dashboard tiles go:** "Add Show" and "Add Entry" live only in the Actions menu. On the dashboard, Add Entry asks which show first. The dashboard keeps status and attention items.
19. **"Close entries now" / "Open entries now"** are added to the show Actions menu, status group. They set the close or open date to now, through the same path as Edit show. Use the confirm-dialog rules: the show is named in plain words, and the dialog says what changes for exhibitors.
20. **Class Requirements** become an inline section on the class page, visible to everyone, and leave the ⋮ menu.

## Defaults from the audit (adopted unless changed)

- Not-found and no-access: one `NotFoundState` whose button leads to the parent list. No silent redirects (H8).
- Failed saves: a friendly message ("Your changes are still here. Try again.") through `utils/friendlyDbError.ts`. Raw error text is never shown (H1).
- Discard prompt on every editing surface, including entry edit and Add Person from the entry flow (H15).
- Row ⋮ menus are 44px (`size="touch"`) (H12). One toolkit search per list (H10).
- Dates and money only through `lib/format/dates.ts` and one money formatter (M2). Trial names only through `formatTrialLabel` (M4).
- One date, date-range and time-of-day component, the same in create and edit (M1). Validation copy reads "Please enter ‹field›" (M11). Required marker from `FormField` (M13).
- Vocabulary: Sex (not Gender), Host Club, Officials (tab and messages), "Pre-Entry Fee" / "Day-of-Show Fee", "Actual Start" / "Actual Finish", one weight unit.
- Show status gets its own family in the shared status grammar, with one color per status (M5). Bulk actions are named buttons (M10). One `ListResultLine` per list (M8).

## Phases

Each phase is one PR (or a few small ones), independently verifiable. A phase is not complete until its tests pass. Coordinate with `archive/plan-crud-standard.md` Phases 3–4, which touch the same detail headers and edit panels: do Phase 5 here after or together with CRUD Phase 4.

**Phase 1: Wording and quick wins** (copy and one-line changes).

- Create verb (decision 1).
- Person, Sex, Host Club, Officials, fee labels, Premium, Secretary and Chair, Actual Start and Finish.
- Remove Show ID from Trial edit (H14).
- `size="touch"` on all row menus (H12).
- Remove duplicate search boxes (H10).
- Visible list titles via `PageHeader showTitle` (H6).
- "—" in table cells; the dog table uses `DOG_STATUS_BADGES`.
- `formatTrialLabel` everywhere (M4).
- "Open in Workbench" becomes "Show Day", and its ⋮ gets an `aria-label` (M17).
- The dog owner link depends on role and carries `backTo` (H16).
- Tests: render tests asserting the new labels on each touched surface, plus a row-menu size test.

**Phase 2: Feedback.**

- Friendly save errors in `EditPanelWrapper` and the show wizard (H1).
- A wrapper-level save or add toast on every path (decision 10, H2).
- Discard prompt on `EntryEditDialog` and the entry-flow Add Person (H15).
- A calm duplicate-dog prompt (M18).
- One pending label, "Saving...".
- Tests: each save path shows the right toast; a failed save shows the friendly copy and keeps the form open; Cancel with changes prompts.

**Phase 3: Forms.**

- Shared tab-error routing (`usePanelValidationNavigation`) on the Show, Trial, Class, Dog and Person panels (H4).
- One Person create form with email optional (decision 3, H3).
- One set of date and time components in create and edit (M1).
- Validation copy (M11) and the required marker (M13).
- Add panels walk every tab (decision 13). Build it once in `EditPanelWrapper` and its tab helpers: create mode plus tabs gives Next until the last tab, with per-tab required-field checks. Build on the existing `ClubEditPanel` "Next: ‹tab›" pattern and `AddDogPanel/TabNavigation.tsx`.
- Tests: an error on a hidden tab switches to that tab; mail-in Add Person saves without an email; create and edit render the same date control.
- Tests: in create mode, Next shows on every tab but the last, and "Add ‹Object›" shows only on the last; Next is blocked with a message while the current tab has a missing required field; earlier tabs stay clickable; edit mode shows Save on every tab.

**Phase 4: Lists.**

- Table toolbar trimmed (decision 4, H11).
- `ListFilterBar` and `ListResultLine` on Trials, Setup Classes and the trial-page class table (M8).
- View toggle in the result line, remembered, with the default rule (decision 8, M9).
- Named bulk buttons (M10).
- One empty-state wording (M7).
- Show status family (M5).
- People list onto the shared page frame (H7).
- Every class row opens the one class-detail URL (H13).
- Tests: render tests for toolbar contents, the default view for each role, and the row click target.

**Phase 5: Detail pages.** _Done in MYK9-930 (#2664)._

- `PageShell` and `PageHeader` breadcrumb on every detail page (decision 11, H5).
- `DetailHero` on Club, Class, Dog and Person (H9).
- `NotFoundState` everywhere (H8).
- The empty-value rule (decision 6, M3).
- Tab history replaces (decision 5, M14).
- Clickable parent links in the hero and breadcrumb (M16).
- One width (M15).
- Tests: for each detail page, the breadcrumb links, hero slots, not-found state, and that Back leaves the page after a tab change.

**Phase 6: Merge Class Management into Setup → Classes** (decision 12).

- Move judge assignment and bulk status into the Setup tab. Redirect the old route. Delete the page.
- Before deleting, grep code and `*.md` for links to the old page.
- Tests: the Setup tab supports judge assignment and bulk status; the old URL redirects.

**Phase 7: Entry vocabulary sweep** (decision 2).

- About 250 strings that use "Registration" to mean an entry become "Entry". Dog registry strings keep "Registration".
- Measure against the real strings first, then do a mechanical sweep in reviewed batches.
- Tests: a behavior test on the key surfaces (Entry Management header, the registration wizard title and confirmation, My Entries), not a grep.

**Phase 9: Duplicate actions** (decisions 14–20, audit D1–D7).

- **Bugs first:** the three behavior-divergence bugs are filed separately. Pull fields, approve status and move-up targets are each their own issue.
- **Collapse each remaining group to its home, per the audit table:**
  - one Withdraw dialog (D5);
  - one class-status vocabulary, with ringside mapped one-to-one (D6);
  - one club Add member form (D7);
  - payment and refund labels;
  - message vs "Send decision email";
  - waitlist Accept routed to Offer Spot;
  - the legacy Entries check-in dropdown deleted.
- **Orphan pages:** move the only copies of venue WiFi, venue map pin, waitlist settings and Refund all entries to their homes (Refund all entries goes into the Cancel flow). Then delete `/secretary/settings`, the pipeline pages, `SecretaryClassDashboard` and `BulkResultEntry`, plus the unused `ShowCompletionWorkflow` and `EntryRowActionMenu`. Grep code and `*.md` for links first.
- **Show status:** decision 15.
- **Close/Open entries now:** decision 19.
- **Dashboard tiles:** decision 18.
- **Result words:** decision 17. Remove the Withdrawn result choice; derive Absent and its reason from the entry status; keep Absent and Excused.
- **Requirements:** decision 20.
- **Tests:**
  - for each collapsed group, the non-home entry points navigate to the home with the expected params, or are absent;
  - a Pulled entry and a Withdrawn entry render "Absent · Pulled" and "Absent · Withdrawn (In season)"; Withdrawn is not offered as a result choice;
  - Close/Open entries now writes the date through the shared path;
  - the orphan routes redirect or return not found.

**Phase 8: Verification walk.**

- Owner walk at desktop width and at 375px across all seven objects: list → detail → edit → save → not-found.
- Record findings on the parent issue.

## Non-goals

- Delete and Edit placement and delete behavior (`archive/plan-crud-standard.md`).
- New features or surfaces. Every change here either copies an existing pattern or removes a duplicate.
