# Actions Menu: Grouped Sections, a Create Group, No Page ⋮

> **Status:** Active

**Date:** 2026-10-08 · **Issue:** MYK9-1063 · **Follows:** [`plan-crud-standard.md`](plan-crud-standard.md) decision 5 (page actions live only in the header Actions menu, shipped in MYK9-928 / #2662) and [`plan-core-object-ui-consistency.md`](plan-core-object-ui-consistency.md) (Add ‹Object› vocabulary, `DetailHero` with no action buttons).
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary. The target user is experienced but older and not very computer literate. Two places to look for "what can I do here" means she learns neither.

## Why

MYK9-928 moved every page-level Edit into the header Actions menu, but it left a second menu behind. On the person page, **Edit Person** is only in the header menu, while **Change Photo**, **Suspend account** and **Send Sign-In Link** are only in a ⋮ on the person card. The owner found this on 2026-10-08 and could not tell which menu held what.

There are three problems:

1. **Two menus for the same object.** The detail pages for person, dog and club still have a ⋮ in the hero card. On phones the header trigger is also a "more" icon (⋯, MYK9-932), so two near-identical icons sit on one screen and hold different items.
2. **The header menu has no structure.** On a person's page it lists Edit Person (this person), Export CSV (the People list), Add Show (global) and Open Show Management (navigation) in one flat list. The viewer cannot tell what each item applies to.
3. **Create depends on where you are.** Add Show appears only on non-show routes, and Add Person / Add Club exist only on their own list pages. A first-time secretary has to know which page to go to before creating anything.

## Owner decisions (2026-10-08)

1. **One home.** The header Actions menu is the only place for page-level actions. Remove every ⋮ from detail-page heroes. Row ⋮ menus and bulk bars stay, because the header cannot know which row is meant (unchanged from crud-standard decision 5).
2. **Labelled groups with dividers, in a fixed order:**
   1. **This object.** The heading is the object's display name ("Richard Beezley", "Fall Scent Weekend"). Items follow the crud-standard order: Edit first, then Add …, then status changes, then reports and export.
   2. **This list.** The heading is the list's name ("People", "Entries in this class"). Present only when the page shows a list, for example Export CSV.
   3. **Create.** Present on every page, with the same items everywhere.
3. **Every item has an icon.** One icon per action, the same icon wherever the action appears (menu and command palette).
4. **The Create group:**
   - **Add Show** and **Add Dog** for anyone who holds that create permission.
   - **Add Person** and **Add Club** for secretaries and site admins only.
   - A viewer without the permission does not see the item at all; it is not greyed out (the registry's existing "belongs vs. unavailable" rule).
   - Each item links to the list page's existing create panel. There is no second form.
   - **Create holds only objects with no parent:** Show, Dog, Person and Club. An object that belongs to another one is created only from its parent's object group, so the parent is never in doubt. Add Trial and Add Classes are in the show's group. A trial's group has Add Classes, focused on that trial. Entries are added from the show's group. None of these is ever in Create.
5. **Navigation leaves the menu.** "Open Show Management" is a link, not an action. It moves to the sidebar and the ⌘K search only.

**Carried forward unchanged** (these settle questions the 2026-10-08 mockup left open):

- **Delete is never in the Actions menu.** It is the Edit panel footer's left button (crud-standard decision 3). The mockup's "Delete dog" item is dropped.
- **An entry has no detail page.** Its actions (Edit, Record payment, Withdraw, Pull) stay in the entry's row menu on Entry Management and the class page. The mockup's "Entry page" menu therefore describes that row menu, not the header. Pull and Withdraw stay separate items and are never synonyms.
- **Labels use Title Case "Add ‹Object›"** (core-object decision 1), not the mockup's sentence case.
- **The header trigger stays as it is**: labelled "Actions" from 640px up, icon-only ⋯ below that (MYK9-932).

## Survey: ⋮ menus on detail pages today (2026-10-08)

| Page   | Component                                                           | Items today                                                           | Destination                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Person | `components/users/UserDetails/HeroProfileCard.tsx` (`ThreeDotMenu`) | Change Photo, Change status (Suspend / Reactivate), Send Sign-In Link | Person group, with the same gates                                                                                                                                                |
| Dog    | `components/dogs/DogDetailsMain/DogHero.tsx` (`ThreeDotMenu`)       | Change Photo, Change status                                           | Dog group. The status pill button in the hero stays; it shows the current status                                                                                                 |
| Club   | `components/clubs/ClubDetails/ClubHeader.tsx` (inline dropdown)     | Change Photo; Email Club, Call Club, Visit Website                    | Change Photo goes to the club group. Email, Call and Website are contact links, not actions: they become visible links in the club's contact details (add them there if missing) |
| Trial  | `components/trials/TrialDetail/TrialInfo.tsx` (Popover)             | Change Photo, Edit Details                                            | **Dead code**: only its own test imports it. Delete the component, its `index.ts` export and `TrialInfo.wording.test.tsx`                                                        |
| Show   | none found                                                          |                                                                       |                                                                                                                                                                                  |
| Class  | none found                                                          |                                                                       |                                                                                                                                                                                  |

**Row-level ⋮ menus that stay** (each acts on one row): the dog page sections (Achievements, Pedigree, Registrations, Past Results, Upcoming Shows), `UserTable`, the club's Upcoming and Past Shows tabs, `MemberList`, `EntryListCard`, `EnrollmentCard`, `RoleAssignmentsPanel`.

## Target menus

Mockup: the 2026-10-08 session's per-object mockup (version 2, with the Create group). The object group lists what moves in plus what is already registered. An item marked _(if a surface exists)_ is included only when an existing page or dialog already does it; it links there. Otherwise it is dropped, never built new in this plan.

| Page   | Object group                                                                                                                                                                                 | List group                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Club   | Edit Club, Change Photo, Add Show for this club _(if a surface exists)_, Appoint secretary _(if a surface exists)_                                                                           | Export CSV (Clubs list, when on it)  |
| Show   | Edit Show, Add Entry for someone else, Add Entry for my dog, Add Trial, Add Classes, Open Entry Forms, Generate & publish premium, plus the status items core-object decisions 15 and 19 add |                                      |
| Trial  | Edit Trial, Add Classes, Print reports _(if a surface exists)_                                                                                                                               |                                      |
| Class  | Edit Class, Open ringside scoring _(if a surface exists)_, Print scoresheets _(if a surface exists)_                                                                                         | Export CSV (entries in this class)   |
| Dog    | Edit Dog, Change Photo, Change status                                                                                                                                                        | Export CSV (Dogs list, when on it)   |
| Person | Edit Person, Change Photo, Send Sign-In Link, Suspend account / Reactivate                                                                                                                   | Export CSV (People list, when on it) |

Create group on every page: Add Show, Add Dog, Add Person (staff), Add Club (staff). On a list page, the list's own create item appears only in Create, never also in the list group: one action, one row.

## Phases

Each phase is one PR, independently verifiable. A phase is not complete until its tests pass.

**Phase 1: Groups, icons and the Create group in the registry.**

- `AppAction` gains `group: 'object' | 'list' | 'create'` and `icon`. `PageObject` gains the display name used as the object group's heading. `resolveActions` returns the groups in the fixed order; the `separatorBefore` bookkeeping is replaced by group boundaries.
- `HeaderActions` renders a labelled group per non-empty group, with a divider between groups and the icon on every item. The command palette uses the same groups as its sections.
- Add the Create group: Add Show (`SHOW_CREATE`), Add Dog (`DOG_CREATE`), Add Person and Add Club (secretary or site admin, matching the gate the list page's own Add button uses). Each links to its list page's create panel by URL; add the URL parameter on any list page that lacks one.
- Remove "Open Show Management" from the registry. Confirm it is reachable from the sidebar and ⌘K first.
- Tests:
  - Resolver unit tests for each route context (show, global, each detail page kind): group order, headings, no item in two groups.
  - Create gating for exhibitor, secretary, club admin and site admin: staff-only items are absent, not disabled, for an exhibitor.
  - `HeaderActions` render test: group labels, dividers between groups only, an icon on every item.
  - The palette and the header list the same actions in the same groups.
  - Grep `e2e/` for "Open Show Management" and "Add Show" locators and update them in the same PR.

**Phase 2: Move hero ⋮ items into the menu; remove the hero ⋮.**

- Pages register their extra object actions next to `usePageEditAction` (new `ActionCommand` values for change photo, change status and send sign-in link, bound to the dialogs the ⋮ opens today). Each item keeps the gate it has today.
- Remove the ⋮ from `HeroProfileCard`, `DogHero` and `ClubHeader`. Move the club's Email / Call / Website to visible contact links.
- Delete `TrialInfo.tsx`, its export and its test.
- If `components/common/ThreeDotMenu.tsx` is left with only row callers, drop the props they no longer use.
- Tests:
  - For person, dog and club: no ⋮ in the hero; the Actions menu's object group lists the moved items in order; each opens the same dialog as before; each is absent for a viewer the old ⋮ hid it from.
  - Grep `e2e/` for "More actions", "Dog actions for" and "Club options" locators and move them to the header menu.

**Phase 3: Complete the object groups.**

- For each _(if a surface exists)_ item in the target table, find the existing surface. Link to it or drop the item, and record which in the PR.
- Tests: one resolver test per added item, including its gate.

**Phase 4: Verification walk.**

- Walk club, show, trial, class, dog and person detail pages, and the Entry Management and class-page row menus, at 375px and desktop, as exhibitor, secretary and site admin.
- Confirm: one menu per page, labelled groups in order, icons on every item, the Create group on every page with the right items per role, and no hero ⋮.
- `header-wordmark-fits.spec.ts` stays green.
- Record the walk with screenshots on the Linear issue.

## Non-goals

- Row ⋮ menus and bulk bars (crud-standard Phase 4 owns their order).
- Delete placement (crud-standard decision 3).
- Show-day screens (ringside, Show Day), which keep their own large-target layout.
- New features behind any menu item. Every item links to a surface that already exists.
- The header trigger's look at phone width (MYK9-932).
