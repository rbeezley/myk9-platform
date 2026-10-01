# Duplicate-Actions Audit

**Date:** 2026-10-01 · **Method:** read-only code read of `origin/main`. "P" = the entry point performs the action itself. "L" = it links to the page that performs it. Anything not confirmed is marked _unverified_.
**Goal (owner):** do each action in one place, the most common place, and minimize copies.
**Placement rules (owner, 2026-10-01; see [`plan-crud-standard.md`](../plan-crud-standard.md)):**

- Page-level actions live only in the header Actions menu, in this group order: Edit, Add…, status changes, reports/export.
- Item actions live on the row ⋮ menu or the bulk bar.
- Show-day screens keep one shared large-target layout.
- Delete sits at the far left of the Edit panel footer.

Paths are under `apps/myk9show/src/`.

## Summary

- About 50 actions inventoried. About 30 have more than one entry point. 14 have more than one implementation, and **7 of those behave differently**.
- The header Actions menu only knows two contexts, `show` and `global` (`features/actions/actionRegistry.ts:60-72`). Club, trial, class, dog, person and the list pages have no menu yet.
- Orphan surfaces have no in-app link (bookmarks _unverified_):
  - `/secretary/pipeline/:trialId`
  - `/shows/:id/trials/:id/classes/:id/secretary` (`SecretaryClassDashboard`, with its own result grid `BulkResultEntry`)
  - `/secretary/settings` (`ShowSettingsPage`). This is the only home of venue WiFi, the venue map pin, waitlist settings and Refund all entries.

  These components are imported nowhere: `ShowCompletionWorkflow.tsx`, `EntryRowActionMenu.tsx`.

## Duplicates that behave differently (fix first)

| #   | Action          | Divergence                                                                                                                                                                                                               | Where                                                                                                                         |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| D1  | Approve entry   | Show Map writes `'confirmed'`. Entry Management writes `'accepted'`, and Show Map appears to skip the decision-email prompt. Whether the two statuses are equivalent is _unverified_                                     | `features/show-map/showMapActionMutations.ts:71-83` vs `components/entries/management/entryActions.tsx:96-104`                |
| D2  | Pull / no-show  | The Show Day path overwrites `special_requests` with the reason and never clears `withdrawal_reason_code`. The Entry Management path clears it (MYK9-632). The two paths also differ in reason capture, undo and wording | `services/show-day/checkInStatus.ts:45-58` vs `services/database/entries/secretary.ts`                                        |
| D3  | Move up         | Show Map limits targets to the entry's own trial but has no capacity filter. The Entry Management approval checks capacity but has no own-trial limit, so it can move an entry across trials                             | `features/show-map/buildMoveUpTargets.ts:30-40` vs `components/entries/moveUpTargets.ts:23-37`                                |
| D4  | Show status     | Four implementations: the status pill, the Edit panel select, the bulk bar (Mark Completed / Cancelled, which bypass closeout) and Show Day closeout. Cancelled can be set with no refund path nearby                    | `ShowStatusPill.tsx`, `ShowEditBasicInfoTab.tsx:122-175`, `ShowBulkActionsBar.tsx:47-50`, `ShowWorkbenchShowDeskPage.tsx:434` |
| D5  | Withdraw        | Two secretary dialogs: a past-tense "Withdrawn" menu item with `WithdrawalReasonDialog`, and the eligibility-checked `RemoveFromClassDialog`                                                                             | `EntryListCard.tsx:299-308`, `RemoveFromClassDialog.tsx`                                                                      |
| D6  | Class status    | Ringside has its own vocabulary (`none/briefing/scoring/break/completed`), mapped lossily onto the shared `applyManualClassStatus`                                                                                       | `features/at-show/slots/classDialogs.tsx:110-135`, `ringsideClassStatusMap.ts`                                                |
| D7  | Club Add member | Two dialogs with different fields                                                                                                                                                                                        | `components/clubs/members/AddMemberDialog.tsx` vs `pages/club-admin/ClubMemberDialogs.tsx:208-260`                            |

## Action groups: home and what happens to every other entry point

| Action                    | Home                                                                             | Other entry points                                                                                                                                                   | Sev  |
| ------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Add entry (secretary)     | Show Actions menu (Add group)                                                    | Entries "Add entry" popover → **delete**; Show Day "Add entries" → keep (show-day fast path, owner Q1); dashboard tile → owner Q4                                    | MED  |
| Pull                      | Entries row status menu                                                          | Show Map "Pull / no-show" → keep as show-day fast path, but the **same mutation and reason dialog** (D2); labels "Pull" / "Pulled"                                   | HIGH |
| Withdraw                  | `RemoveFromClassDialog`                                                          | Entries "Withdrawn" item → verb "Withdraw…" opening the same dialog; delete `WithdrawalReasonDialog` if then unused                                                  | HIGH |
| Move up                   | Entries Move-ups view (requests); Show Map (day-of)                              | One target builder for both: own trial **and** capacity (D3)                                                                                                         | HIGH |
| Approve / accept / reject | Entries                                                                          | Show Map review sheet → **link** to `/shows/:id/entries?attention=pending&mode=review`; delete `ShowMapEntryReviewSheet` and its approve mutations (D1)              | HIGH |
| Payments and refunds      | Entries card Payment section                                                     | Labels: "Record refund (cash/check)" vs "Refund online payment"; exhibitor "Complete payment" → "Finish payment"; Refund all entries moves into the Cancel show flow | HIGH |
| Show status               | Actions menu, status group: Publish / Move to draft, Close out show, Cancel show | Pill → read-only chip; Edit panel status select → display only; bulk Mark Completed → delete; bulk Cancelled → link to the Cancel flow                               | HIGH |
| Premium publish           | Actions menu, status group                                                       | Overview card keeps the status text only (owner Q3); "Copy landing link" and "Preview as exhibitor" join the menu                                                    | MED  |
| Edit show                 | Actions menu, first item, "Edit show"                                            | Header button → delete                                                                                                                                               | MED  |
| Add trial / Add classes   | Show Actions: "Add trial", "Add classes"; trial Actions: "Add classes"           | Setup toolbar buttons → delete; empty-state CTAs → keep                                                                                                              | MED  |
| Assign judge to class     | Class Edit panel                                                                 | Class Management inline select goes away with the merge; creating a judge uses one Person form                                                                       | MED  |
| Class status              | Show Day rows                                                                    | Class Management menu goes with the merge; ringside keeps its layout with the same four words (D6)                                                                   | HIGH |
| Club Add member           | `/club-admin/members` dialog                                                     | Club page Members tab → same component or a link (D7)                                                                                                                | HIGH |
| Check in                  | Show Day surfaces (one shared writer)                                            | Keep all show-day UIs, wording "Check in"; delete the legacy Entries check-in dropdown                                                                               | MED  |
| Self check-in toggle      | Show Day tool                                                                    | Delete `SettingsOverrideCard` together with the orphans                                                                                                              | MED  |
| Run order                 | Show Day                                                                         | Keep; one label, "Set run order"                                                                                                                                     | MED  |
| Scoring                   | Paper scoring (secretary), ringside scoresheet (judge/steward)                   | Delete `BulkResultEntry` with the orphan; result values "Withdrawn"/"Absent" collide with Pull ≠ Withdraw (owner Q6)                                                 | HIGH |
| Contact exhibitor         | Message center (free text)                                                       | Entries "Email Exhibitor" → "Send decision email"; Show Map "Message handler" → keep                                                                                 | MED  |
| Waitlist                  | Waitlist view (Offer Spot / Remove)                                              | Entries "Accept" on a waitlisted row → hide or route to Offer Spot (offer-flow bypass _unverified_)                                                                  | MED  |
| Access codes              | Show Day                                                                         | Overview → link; wizard success → keep; orphan → delete                                                                                                              | LOW  |
| Reports / export          | Reports tab (printed); Actions menu Export group ("Export CSV") for data         | Show Map paperwork links → keep                                                                                                                                      | MED  |
| Add Person                | `/people`                                                                        | Command palette "Add New User", shortcut "Create Person" → "Add Person"                                                                                              | LOW  |
| Enter a show (exhibitor)  | Show page                                                                        | All links; align the casing                                                                                                                                          | LOW  |

Already-correct links (don't touch): notification and toast links, dashboard attention strips, class readiness metrics → Entries filters, Show Map "Open class" / "Print Check-In Sheet" / "Submit final results", the command palette presets, and the legacy `/secretary/*` redirects.

## Resulting Actions menus (group order: Edit | Add | Status | Reports/Export)

- **Show** (every tab and Show Day, identical): Edit show | Add entry for someone else, Add entry for my dog, Add trial, Add classes | Publish / Move to draft, Generate & publish premium, Close out show | Export entries CSV, Copy landing link. That is 10 items. Adding Cancel show, Add late entry and Preview would overload it.
- **Trial:** Edit trial | Add classes | — | Print trial reports, Export trial financials.
- **Class:** Edit class | — | — | Print check-in sheet.
- **Club:** Edit club | Add show, Add member, Appoint secretary | Authorize club (site admin).
- **Dog:** Edit dog | Add registration, Enter a show.
- **Person:** Edit person | Add dog.
- **Lists:** Add show / club / dog / person (+ Export CSV on Shows).
- **Navigation** items (Open Entry Management, Open Show Desk) leave the menu, because they duplicate the tabs; they stay in the command palette.

## Owner questions

1. Show Day "Add entries" / "Add late entry": keep as a show-day tool, or menu only?
2. "Cancel show" and "Close out show": both in the Actions menu, or Cancel only in the Edit panel?
3. Status banners with their own button ("Finish payment", "premium not published", Overview publish cards): keep the button, or menu only?
4. Dashboard tiles "Add Show" / "Add Entry": are they page content (keep) or chrome (menu only)?
5. "Close entries now" / "Open entries now": menu items, or keep them date-driven in Edit?
6. Scoring result values "Withdrawn" / "Absent": rename to fit Pull ≠ Withdraw (for example "Pulled", "No show")?
7. Class page "Requirements": a menu item or an inline link?
