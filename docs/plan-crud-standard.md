# One Standard for Create, Edit and Delete

> **Status:** Active

**Date:** 2026-10-01 · **Follows:** [`plan-secretary-crud-consolidation.md`](plan-secretary-crud-consolidation.md) (one way to create and edit each object) and [`plan-secretary-show-actions.md`](plan-secretary-show-actions.md) (the placement rule).
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary: the anti-pattern is "anything that makes the user feel like they need to learn the software."

## Why

The consolidation plan gave each of the seven core objects (club, show, trial, class, entry, dog, person) one way to create and one way to edit. Delete was out of its scope. A read-only audit on 2026-10-01 found that delete is the least consistent operation:

- **What "delete" means changes by object.** Shows, classes, dogs and people are soft-deleted and can be restored. Trials are hard-deleted, along with everything under them. "Remove entry" is soft on Entry Management but hard on the class page (`store/entryStore.ts:152`, the replication queue's real `.delete()`), behind the same dialog.
- **Delete is in a different place on every object.** Show: bottom of the Edit panel. Trial, class, club, dog and person: a ⋮ menu. Entry: a trash icon, plus a duplicate item in the status popover. The owner could not find show delete.
- **There are eight different confirm dialogs, and several of them are untrue.** The class dialog says "cannot be undone", but the class is restorable. Several dialogs say "an administrator can restore it", while a secretary has no undo at all.
- **Only dogs are guarded.** `soft_delete_dog` refuses a dog that has paid or scored entries (MK002). Shows, trials, classes and entries have no money guard, and a show delete leaves its enrollments, payments and Stripe orders behind.
- **Gates disagree.** Person Delete is shown to every viewer, and the server refuses most of them with a bare 42501. Club delete is site-admin only in the UI, but `clubs_update` lets a club admin write `deleted_at` directly. Several update policies would let a show manager set `deleted_at` directly and skip the RPC guards. That last point is not yet tested.

## Owner decisions (2026-10-01)

1. **Soft delete everywhere.** Every delete hides the item and keeps its data. The item and everything it cascaded to restore together as one unit. Permanent purge is a site-admin-only action on Admin → Deleted Items.
2. **Money guard.** A secretary cannot delete a show, trial, class or entry that has paid or scored entries. The control says why and points to the right path: **Cancel show** for a show, **Withdraw** or **Pull** for an entry (Pull and Withdraw are never synonyms). The server enforces the same rule. A site admin may override.
3. **Placement** (revised 2026-10-01). Delete is a **"Delete ‹object›" button in the Edit panel's footer, on the far left**, on the same row as Cancel and Save (which stay on the right). This replaces the earlier "red row at the bottom of the form", which you had to scroll to reach.
   - **Style:** a clear gap separates it from Cancel and Save. It is a destructive outline or text button, never a filled red button, so it does not compete with Save.
   - **Visibility:** shown in edit mode only, never when creating, and hidden from any viewer the server would refuse.
   - **At phone width:** it drops to its own line below Cancel and Save, still on the left.
   - **Built once:** a single `onDelete` option on the shared `EditPanelWrapper`, so every object's panel gets the same footer.
   - On lists, Delete stays in the row menu and the bulk bar, through the same dialog. Delete never appears in a header ⋮ or the Actions menu.
4. **Undo.** After a delete, the confirmation toast offers **Undo** to the person who deleted. After that, only a site admin restores, and every dialog says exactly that.
   - **Every delete asks "are you sure" first** (2026-10-01). This holds for single deletes, row menus and bulk bars alike; there is no one-click delete anywhere. The dialog identifies the item in plain language:
     - **Title** names the object type and the item: "Delete the show Heartland Scent Work Classic?", never "Delete item?" or "Confirm deletion".
     - **One identifying detail**, so two similar items cannot be confused:
       - show: dates and club;
       - trial: `formatTrialLabel` and date;
       - class: level, element and trial;
       - entry: the dog's call name, the handler and the class;
       - dog: call name and owner;
       - person: name plus email or town;
       - club: name and city.
     - **What goes with it, as counts in words:** "This also removes its 2 trials, 10 classes and 14 entries."
     - **What happens next:** "You can undo this for 10 minutes. After that, ask a myK9 administrator to restore it."
     - **Buttons name the action:** "Delete show" and "Keep it". Never "OK", "Confirm" or "Yes".
     - **Bulk:** the dialog lists up to 5 item names, then "and N more".
5. **Page actions live in the header Actions menu only** (revised 2026-10-01, replacing "Edit in both places").
   - Every page-level action lives only in the header Actions menu, with no visible action buttons on detail pages. That covers Edit, every "Add …", status changes (publish, open entries), reports and export.
   - The menu is complete and uses the same grouped order on every page: **Edit ‹object›** first, then **Add …**, then status changes, then reports and export. Delete is never in the menu (decision 3).
   - Item-level actions stay in the row ⋮ menu or the bulk bar, because the header cannot know which row is meant.
   - Show-day screens (ringside, Show Day / Show Desk) keep their own large-target layout. That layout is the same across all show-day screens.
   - The visible "Edit show" header button from the consolidation plan's Phase 6 (MYK9-904) is removed. The owner set aside its finding that Edit inside the menu was too hidden: one predictable place outweighs a visible shortcut.

## Defaults (change before Phase 1 if you disagree)

- **Bulk delete** (shows, classes, dogs) uses the same dialog, guard and wording as single delete, with counts.
- **Type-to-confirm** only for show and club, the widest-reaching deletes. Every other object uses a plain confirm with a preview of what goes with it.
- **Club delete**: site admin only. It is refused while the club has live shows. The client control and the server must agree.
- **Dog and person**: keep today's server rules (dog: owner, co-owner or admin; person: admin, self, or a show manager for people in their shows). Hide the control whenever the server would refuse it, as the dog page already does.
- **Edit on lists and entries**:
  - **List row**: **Edit** is the first item of the row menu, opening the same panel as the detail page.
  - **Entry** (no detail page): Edit is the first item of the entry's row menu on Entry Management and the class page, opening `EntryEditDialog`. The unlabelled pencil goes.
  - Together with decision 5, this replaces the six shapes found today: ghost button (club), outline button (trial, class), button plus an Actions duplicate (show), ⋮-only for exhibitors with a separate button for secretaries (dog), ⋮-only (person), and an unlabelled pencil (entry).
- **Entry**: one Remove control per entry row. The duplicate "Remove Entry" in the status popover goes.
- **Create doors**: out of scope. The consolidation plan owns them.

## The standard

| Piece              | Rule                                                                                                                                                                                                                                                                                                                                                                                                                         | Built from                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Server delete      | One `soft_delete_<object>` SECURITY DEFINER RPC per object. Stamps one shared `deleted_at` across the cascade, checks the money guard, returns a coded refusal. REVOKE from PUBLIC/anon.                                                                                                                                                                                                                                     | `soft_delete_show`, `soft_delete_class`, `soft_delete_dog` (MK002)                             |
| Server restore     | One `restore_<object>` RPC per object that restores everything sharing the `deleted_at`. Allowed for a site admin, or for the deleter within a short window (this is what Undo calls).                                                                                                                                                                                                                                       | `restore_show`, `restore_class`                                                                |
| Direct-write block | A trigger refuses any change to `deleted_at` that does not come from these RPCs, so update policies cannot bypass the guards.                                                                                                                                                                                                                                                                                                | new                                                                                            |
| Client delete      | One shared delete service per object: pre-count blockers (three-state, like `blockingEntryCount.ts`), call the RPC, purge the local replica, show the Undo toast.                                                                                                                                                                                                                                                            | `DeleteDogDialog`, `purgeDeletedShow` (#2640)                                                  |
| Dialog             | One `DeleteObjectDialog` that takes the object type. It always asks "are you sure". The title names the type and item in plain words, plus one identifying detail. It shows what goes with the item (counts) and what happens next (Undo, then admin restore). Delete is disabled with a reason and a link to Cancel/Withdraw when blocked. Buttons read "Delete ‹object›" / "Keep it". All copy comes from one copy module. | `DeleteDogDialog`, `cascadingDeleteDialogCopy.ts`                                              |
| Edit placement     | "Edit ‹object›" is the first item of the header Actions menu on every detail page (no header button); the first item of every list row menu.                                                                                                                                                                                                                                                                                 | `features/actions/actionRegistry.ts` "Edit show details"                                       |
| Delete placement   | "Delete ‹object›" at the far left of the Edit panel footer (Cancel and Save on the right); plus the list row menu and bulk bar.                                                                                                                                                                                                                                                                                              | `EditPanelWrapper` footer (new `onDelete` option); replaces the `ShowEditPanel.tsx` bottom row |
| Gate               | The control's gate equals the RPC predicate, and is hidden when the server would refuse.                                                                                                                                                                                                                                                                                                                                     | `useCanDeleteDog`, `canManageShowSurface`                                                      |

## Phases

Each phase is one PR, independently verifiable. A phase is not complete until its tests pass. Server phases need a `db push` with owner confirmation.

**Phase 1: Server foundation.**

- Add `soft_delete_trial`, `soft_delete_entry` and `soft_delete_club`.
- Add the missing `restore_trial`, `restore_entry` and `restore_club`.
- Add the money and scored guard (one private counting function, scoped by show, trial, class or entry) to the show, trial, class and entry delete RPCs, with a coded refusal and a site-admin override.
- Add the direct-write block trigger.
- Allow the deleter to restore within the Undo window.
- Tests: one behavioral SQL test per RPC covering cascade, guard, override, the trigger block and the restore window. Verify grants on the live database after the push.

**Phase 2: One client delete path.**

- Build the shared delete service and `DeleteObjectDialog`, with honest copy and an Undo toast.
- Move trial delete and the class-page entry delete off the replication queue's hard `.delete()` and onto the soft RPCs.
- Route Class Management and the trial-page class delete through the same purge so Setup never goes stale.
- Tests: the dialog's three states (unknown, blocked, allowed), the Undo call, a replica purge test for each object, and a test that no code path calls a hard delete for these seven tables.
- Tests: for each object, the confirm dialog title contains the object type and the item's name; the identifying detail renders; counts render in words; the buttons read "Delete ‹object›" and "Keep it"; no delete path (row, bulk, panel footer) completes without the dialog.

**Phase 3: Placement and gates.**

- Add an `onDelete` option to `EditPanelWrapper` that renders "Delete ‹object›" at the far left of the footer (edit mode only, gated, destructive outline style, its own line at phone width). Use it on the show, club, trial, class, dog and person panels, and move the show panel's bottom-of-form row into the footer. Entry gets the same footer in `EntryEditDialog`, or moves onto the wrapper.
- Remove Delete from every header ⋮ menu and remove the duplicate entry popover item.
- Bulk bars use the shared dialog.
- Align the person and club gates with the server.
- Tests:
  - For each object: Delete renders in the footer's left slot in edit mode, is absent in create mode, is hidden for a viewer who cannot delete, and is absent from header and Actions menus.
  - Gate tests for each role.

**Phase 4: Page actions into the Actions menu.**

- Register every page-level action for club, show, trial, class, dog and person in the route-context action registry (`features/actions/actionRegistry.ts`) in the standard group order: Edit first, then Add …, then status changes, then reports and export. Gate each entry exactly as its old button was gated.
- Remove the visible page-level action buttons: the "Edit show" header button (`ShowPageHeaderActions.tsx`), the trial and class hero Edit buttons, the club ghost Edit, the dog Edit button and ⋮ Edit, the person ⋮ Edit, and any other page-level button the duplicate-actions sweep lists. Remove the entry pencil; Edit becomes the first row-menu item.
- Make Edit the first row-menu item on every list.
- Tests:
  - For each detail page: no visible page-level action buttons; the Actions menu lists the expected items in group order, each hidden for a viewer who cannot use it, and "Edit ‹object›" opens the Edit panel.
  - For each list: a row-menu order test.

**Phase 5: Verification walk.**

- Owner walk on a test show: delete and Undo each object as a secretary; confirm a paid or scored object is blocked with the right pointer; restore as a site admin; confirm counts and lists are fresh without a reload.
- Record the walk on the parent issue.

## Non-goals

- Create-door consolidation, which belongs to the consolidation plan.
- Refund logic. Cancel and Withdraw already own it; this plan only points to them.
- A secretary Deleted Items page. Undo covers the mistake case.
