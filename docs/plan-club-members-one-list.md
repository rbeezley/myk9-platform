# Club Members: one list instead of four sub-tabs

> **Status:** Active

Linear: MYK9-2364. Owner decisions recorded on the issue 2026-11-25: one Members list with role badges replaces the four sub-tabs; every existing officer reader keeps working unchanged; pending show-access requests stay a separate card above the list; the Event Committee (MYK9-2064) becomes its own card under the list. The "Show secretary" rename (MYK9-2363, #4343) is merged, so the badges use that wording. No code has been written.

## Why

A club admin asks "who can do what in this club?" The answer is spread over four tabs of `ClubMembersManager.tsx` that all show the same people sliced by role. A person who is admin, show secretary and president (Mariann at Tulsa) is in three of them.

## 1. Today

All paths are in `apps/myk9show/src/pages/club-admin/` unless noted. The tab strip is built in `useClubShowAccessRequests.ts:45-66` and rendered at `ClubMembersManager.tsx:149-268`.

| Sub-tab                          | What it shows and does                                                                                                                                                                                                                                                                  | Where                                                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Members                          | Roster table; a "Show secretary" badge on a member who is appointed; status views, search, "Add Member"; the pending membership-request card above it; row menu: View profile, Change Type, Change Status, Appoint/Revoke show secretary, Remove Member.                                | `ClubMembersManager.tsx:156-203`, `ClubMemberTables.tsx:41-136` (badge `:75-80`), `MemberActionMenu.tsx:54-165`, `clubMemberListViews.ts:184-217`                                                                    |
| Officers                         | Officers table (position, name, email, term), "Assign Officer" dialog (pick a member, a person, or type a name for someone with no account), remove by trash button, the note "Printed in your premium list...", and the Event Committee block below.                                   | `ClubMembersManager.tsx:206-247`, `ClubMemberTables.tsx:146-220`, `AssignOfficerDialog` in `ClubMemberDialogs.tsx:218`, `ClubCommitteeSection` (`components/committee/`)                                             |
| Show secretaries (`show-access`) | Appointed secretaries, including people who are not members; "Appoint show secretary" dialog over all people; Revoke with a confirm; last-secretary and "no secretary, N upcoming shows" warnings; the pending secretary-request card (Approve / Deny with a note) and its count badge. | `ClubMembersManager.tsx:250-262`, `ClubShowAccessTab.tsx:49-152` (dialog), `:171-227` (tab), `:237-334` (list and warnings, last secretary `:326`), `ClubShowAccessRequests.tsx`, `useClubShowAccessRequests.ts:60+` |
| Admins                           | Club admins (can be non-members); add by email behind a confirm; remove behind a confirm; "A club always keeps at least one admin"; removing yourself leaves the page.                                                                                                                  | `ClubMembersManager.tsx:265-267`, `ClubAdminsTab.tsx:77-95` (add), `:139-173` (confirms), `useClubAdmins.ts:217-300`                                                                                                 |

State and mutations: `useClubMembersManager.ts` (queries `:96-121`, mutations `:164-273`, handlers `:284-366`, load and error gating `:370-387`).

### Every grant and removal, and what it calls

All of these go through `apps/myk9show/src/services/database/`. Role changes need a password confirmed in the last five minutes (MYK9-1208, `MKAUT`).

| Action                            | Call                                                                                                          | File                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Add member                        | `club_members` insert                                                                                         | `club-memberships/members.ts:68`                         |
| Change type / status              | `club_members` update                                                                                         | `members.ts:87`                                          |
| Remove member                     | `club_members` delete (does not end show access)                                                              | `members.ts:104`                                         |
| Appoint / revoke show secretary   | RPC `grant_club_secretary` / `revoke_club_secretary`, `{p_club_id, p_person_id}`                              | `club-memberships/show-managers.ts:61`                   |
| Add admin                         | RPC `add_club_admin_by_email(club, email)`, returns `added` or `no_account`                                   | `club-memberships/club-admins.ts:36`                     |
| Remove admin                      | RPC `revoke_club_admin`, refuses the last admin                                                               | `club-admins.ts:45`                                      |
| Assign officer                    | `club_officers` insert (`person_id` or typed `display_name`, plus `position`; unique per person and position) | `club-memberships/officers.ts:50`                        |
| Remove officer                    | `club_officers` delete                                                                                        | `officers.ts:69`                                         |
| Approve / deny secretary request  | RPC `approve_club_role_request` / `deny_club_role_request`                                                    | `services/database/role-requests/index.ts:229, 238`      |
| Approve / deny membership request | RPC `approve_club_membership_request` / `deny_club_membership_request`                                        | `services/database/club-membership-requests.ts:107, 117` |
| Event Committee                   | `club_committee_members` reads and writes                                                                     | `club-memberships/committee.ts`                          |

### Every reader of officers (grep of the whole repo)

1. `features/premium/fetchPremium.ts:35` and `features/_shared/landing/useLandingShowData.ts:82-88` both call `fetchShowClubOfficers` (`officers.ts:81`), which calls RPC `get_show_club_officers`. This feeds the premium list and the public show page (MYK9-2045). It reads the `club_officers` table, so it works for a signed-out viewer and for typed-name officers.
2. `ClubMembersManager` itself, through `getClubOfficers` (`officers.ts:40`).
3. `get_club_officials` / `useClubOfficials` (the names under the club's title) reads `user_roles`, not `club_officers`. The Event Committee uses its own tables and `get_show_committee`. Neither is an officers reader.

This plan changes no table, RPC or service function in that list, so every reader keeps working unchanged. Officers still feed nothing but the premium list and the public page; they grant no permission.

## 2. Proposed shape

**The list.** One table, one row per person, covering everyone with any link to the club: members, admins, show secretaries, and officers. Admins and secretaries need not be members, and an officer can be a typed name with no account, so rows come from four sources merged by person id (a typed-name officer is its own row, keyed by the officer id). A non-member shows "Not a club member" in the Type column and gets no membership items in the menu. The merge is a pure function with its own tests.

**Badges** on the Name cell: `Admin`, `Show secretary`, and one badge per officer title (`President`, `Vice President`, `Club secretary`, `Treasurer`, `Board Member`). A person can hold several titles.

**View.** The View dropdown (`ListViewTabs`) becomes role views: All, Admins, Show secretaries, Officers, each with a count. The membership-status views (Active, Lapsed, Suspended, Resigned) are not dropped: they move into the Filter menu as a "Status" options field (`ListFilterBar` takes `fields`, currently `[]` at `ClubMembersManager.tsx:181`). The `?status=` URL param keeps working; a new `?view=` carries the role.

**Row menu** (`MemberActionMenu.tsx`): View profile, Change Type, Change Status stay. The Show secretary group stays (Appoint / Revoke). New: `Make admin` / `Remove admin` (needs the person's email, so it is disabled with a reason when the person has none; uses the same RPC as today), and `Set officer title` (opens the existing `AssignOfficerDialog` with the person fixed) with one `Remove <title>` item per title held. Remove Member stays. Destructive items keep today's confirm dialogs: revoke secretary, remove admin (including the last-admin refusal and leaving the page when removing yourself), remove member, remove officer.

**Header actions** for people not yet on the roster: one "Add" menu replacing the "Add Member" button: Add member, Add admin by email, Appoint show secretary, Add officer by name. These are the existing dialogs, not new ones.

**One line above the list:** "Admins manage the club: members, payments and branding. Show secretaries create and run the club's shows. Officer titles print in your premium list and change nothing else."

**Two cards.** Above the list: one card holding pending requests, as it does today (membership requests, and secretary requests moved here from the deleted tab with their count badge). Under the list: the Event Committee card (`ClubCommitteeSection`, unchanged).

**Deleted:** the Officers, Show secretaries and Admins sub-tabs, `OfficersTable`, `ClubShowAccessTab`'s list (its `AppointSecretaryDialog` and the warnings move), `ClubAdminsTab`'s list (its add and remove confirms move), and the tab-def memo in `useClubShowAccessRequests.ts`. With one tab left, `PrimaryTabs` goes too.

### Nothing is lost

| Today                                                          | After                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Add member                                                     | Header "Add" > Add member                                                                |
| Change type, change status, remove member                      | Row menu, unchanged                                                                      |
| Status views and counts                                        | Filter menu "Status" field                                                               |
| Search by name or email                                        | Same search box                                                                          |
| See who is an officer, with term dates                         | Title badges; term dates in the row's title tooltip and the Set officer title dialog     |
| Assign officer (member, any person, typed name)                | Row menu "Set officer title" for people; header "Add officer by name" for typed names    |
| Remove officer                                                 | Row menu "Remove `<title>`"; typed-name officer row has only this item                   |
| "Printed in your premium list..." note                         | Last sentence of the one-line role explanation                                           |
| Event Committee block                                          | Its own card under the list                                                              |
| See appointed secretaries, including non-members               | Show secretary badge; non-members appear as rows; "Show secretaries" view                |
| Appoint a secretary who is not on the roster                   | Header "Add" > Appoint show secretary (same dialog, same people picker)                  |
| Revoke secretary, with confirm                                 | Row menu, same confirm                                                                   |
| Last-secretary and "no secretary, N upcoming shows" warnings   | Same text, shown above the list while the condition holds                                |
| Approve or deny a secretary request, with a note               | Request card above the list, same buttons and RPCs                                       |
| Approve or deny a membership request                           | Same card                                                                                |
| See club admins, including non-members                         | Admin badge; non-members appear as rows; "Admins" view                                   |
| Add admin by email, with confirm                               | Header "Add" > Add admin by email, same confirm; row menu "Make admin" uses the same RPC |
| Remove admin, last-admin refusal, self-removal leaves the page | Row menu "Remove admin", same confirm and handling                                       |
| "Roster unavailable" and per-source "could not load" notices   | Kept per source: a failed source says so; its badges are never rendered as absent        |

Two things to carry over deliberately. The admin list is online-only (`refetchOnMount: 'always'`, offline message at `ClubAdminsTab.tsx:97`); offline, admin badges are unknown, so the list says so rather than showing nobody as admin. And the secretary request badge count moves to the card heading.

## 3. The smaller option, and doing nothing

**Do nothing.** It works, every action has a test, and the page grants permissions, so a change risks a regression there. Cost: the click-through stays, the same action is reachable from a row menu and a tab (secretary appoint and revoke are in both today), and non-members can only be seen in tabs. Owner has already decided against it.

**Smaller change: keep the tabs, add badges and a role filter to the Members tab.** This fixes "who is what" at a glance and touches no mutation. It does not remove any tab, so the duplication stays (Mariann is still in three places), admins and secretaries who are not members still need their tabs, and we would carry the badge logic and the tabs side by side. It is a good first step, not an end state.

**Recommendation:** the approved shape, built in two PRs so each is checkable. PR A: the merged-rows function with tests, badges, the role View, the new row-menu items; the old tabs stay. PR B: header "Add" menu, the cards, delete the three tabs, update the guide. PR A is the smaller change above, so if PR B is delayed the club already has the glanceable answer.

## 4. Testing phase

Unit tests (custom render from `src/test/utils/testUtils.tsx`), one per row-menu action, each asserting the service call with its exact arguments (assertion-first, run red before the code):

- Make admin: `addClubAdminByEmail(clubId, <that person's email>)`; disabled with a reason when no email; `no_account` shows the existing error.
- Remove admin: `removeClubAdmin(clubId, personId)` after confirm; last-admin refusal message; removing yourself navigates to the club page and refreshes permissions.
- Appoint and revoke show secretary: `setClubShowManagerAccess` with `grant: true` and `grant: false` (the revoke only after confirm); last-secretary warning.
- Set officer title: `addClubOfficer` with `{clubId, personId, position}`; typed name via header "Add officer by name" sends `displayName`; the duplicate-position error toast.
- Remove officer title: `removeClubOfficer(officerId)` for one of two titles on the same person leaves the other badge.
- Remove member, change type and status: carry over the existing assertions.
- Merge function: member only, admin only (non-member), secretary only, typed-name officer, one person with all three roles appears once with three badges; each View filters correctly; a failed source does not render as absence.
- Request cards: approve and deny keep their RPC arguments (existing tests move with the card).
- Existing test files for the deleted tabs (`ClubShowAccessTab.test.tsx`, `ClubAdminsTab.test.tsx`, `ClubMembersManager.officers.test.tsx`, `ClubMembersManager.showAccess.test.tsx`) are rewritten against the row menu, not deleted outright: each assertion must land in a new test or be named as intentionally dropped.

Before reporting: the three affected-test sets from the implementer rules (changed files, `pnpm vitest related`, `src/test/ci`), `typecheck:app`, `typecheck:tests`, lint, `pnpm qa:code-quality-ratchet` (the manager and its hook are near the 500-line cap, so the row-merge and menu code go in sibling modules), `pnpm qa:em-dash-ratchet`.

The walk to update: `docs/qa/club-admin-ux-walk-2026-08-02.md` and `docs/qa/club-pages-audit-2026-07-18.md` name the four tabs; add a dated walk of the one list as a club admin who is also secretary and president, and as a club with a non-member secretary and a typed-name officer. The user guide `docs/user-guides/club-admin-guide.md` (Sections 4 and 7, screenshot C-06, lines 119-140, 148, 254-285) and its outline quote the tab names; CI fails on guide text the app no longer has, so PR B changes them and recaptures C-06. The e2e suite map needs a row only if a spec is added.

## Does this duplicate an existing surface?

No. It removes three. Every dialog and RPC is reused; no new page, sheet or endpoint.

## Open for the owner

- Status views moving into the Filter menu (section 2) is my call to keep "nothing lost"; say if you would rather keep the status dropdown and put the role filter in the Filter menu instead.
- "Add officer by name" is the only way to add a person with no account, so it stays as a header item.
