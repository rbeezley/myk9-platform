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
3. **Placement.** Delete is a red "Delete ‹object›" row at the bottom of each object's Edit panel. This extends the 2026-09-17 show decision to all seven objects. On lists, Delete stays in the row menu and the bulk bar, through the same dialog. Delete never appears in a header ⋮ or Actions menu.
4. **Undo.** After a delete, the confirmation toast offers **Undo** to the person who deleted. After that, only a site admin restores, and every dialog says exactly that.

## Defaults (change before Phase 1 if you disagree)

- **Bulk delete** (shows, classes, dogs) uses the same dialog, guard and wording as single delete, with counts.
- **Type-to-confirm** only for show and club, the widest-reaching deletes. Every other object uses a plain confirm with a preview of what goes with it.
- **Club delete**: site admin only. It is refused while the club has live shows. The client control and the server must agree.
- **Dog and person**: keep today's server rules (dog: owner, co-owner or admin; person: admin, self, or a show manager for people in their shows). Hide the control whenever the server would refuse it, as the dog page already does.
- **Edit**: every detail page shows one labelled **Edit** button that opens the object's Edit panel. This replaces the six current shapes (ghost button, ⋮ item, unlabelled pencil, and others).
- **Entry**: one Remove control per entry row. The duplicate "Remove Entry" in the status popover goes.
- **Create doors**: out of scope. The consolidation plan owns them.

## The standard

| Piece | Rule | Built from |
| --- | --- | --- |
| Server delete | One `soft_delete_<object>` SECURITY DEFINER RPC per object. Stamps one shared `deleted_at` across the cascade, checks the money guard, returns a coded refusal. REVOKE from PUBLIC/anon. | `soft_delete_show`, `soft_delete_class`, `soft_delete_dog` (MK002) |
| Server restore | One `restore_<object>` RPC per object that restores everything sharing the `deleted_at`. Allowed for a site admin, or for the deleter within a short window (this is what Undo calls). | `restore_show`, `restore_class` |
| Direct-write block | A trigger refuses any change to `deleted_at` that does not come from these RPCs, so update policies cannot bypass the guards. | new |
| Client delete | One shared delete service per object: pre-count blockers (three-state, like `blockingEntryCount.ts`), call the RPC, purge the local replica, show the Undo toast. | `DeleteDogDialog`, `purgeDeletedShow` (#2640) |
| Dialog | One `DeleteObjectDialog` that takes the object type. It shows what goes with the item (counts), disables Delete with a reason and a link to Cancel/Withdraw when blocked, and uses honest copy from one copy module. | `DeleteDogDialog`, `cascadingDeleteDialogCopy.ts` |
| Placement | A red row at the bottom of the Edit panel, plus the list row menu and bulk bar. | `ShowEditPanel.tsx` delete row |
| Gate | The control's gate equals the RPC predicate, and is hidden when the server would refuse. | `useCanDeleteDog`, `canManageShowSurface` |

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

**Phase 3: Placement and gates.**
- Add the red Delete row to the Edit panels for club, trial, class, dog and person. Entry gets one in `EntryEditDialog`.
- Remove Delete from every header ⋮ menu and remove the duplicate entry popover item.
- Bulk bars use the shared dialog.
- Align the person and club gates with the server.
- Tests: render tests for each object asserting where Delete appears, and that it is absent from header menus. Gate tests for each role.

**Phase 4: Edit verb.**
- One labelled Edit button on each detail page.
- Remove the secretary-only dog Edit variant and the person ⋮ Edit.
- Tests: render tests for each detail page.

**Phase 5: Verification walk.**
- Owner walk on a test show: delete and Undo each object as a secretary; confirm a paid or scored object is blocked with the right pointer; restore as a site admin; confirm counts and lists are fresh without a reload.
- Record the walk on the parent issue.

## Non-goals

- Create-door consolidation, which belongs to the consolidation plan.
- Refund logic. Cancel and Withdraw already own it; this plan only points to them.
- A secretary Deleted Items page. Undo covers the mistake case.
