# IA Review: Admin Person Detail + Soft-Delete Lifecycle

**Date:** 2026-08-01
**Auditor:** Claude
**Sources:** Route audit + code-traced task walk (no live browser; see Step 2 method note) + `docs/INTENT.md`
**Scope:** The site-admin path from `/admin/users` to a single person, plus the soft-delete lifecycle that spans `/admin/users`, `/admin/deleted-items`, and the two delete dialogs.
**Origin:** Follow-up to the impeccable-playbook run on `/admin/users` (PR #1553), which renamed the affordance labels (mechanical scope) and left the structural question open.

---

## Step 1: Route Audit

**Surface scope:** Site-admin people management.

| Route                                   | Purpose                                                    | Target user | Parent in IA     | Component                                            |
| --------------------------------------- | ---------------------------------------------------------- | ----------- | ---------------- | ---------------------------------------------------- |
| `/admin/users`                          | Roster of all people: search, filter, bulk role/status ops | Site admin  | `/admin` (top)   | `pages/admin/UserManagementPage.tsx`                  |
| `/admin/deleted-items`                  | Restore surface for 7 soft-deleted entity types, incl. People | Site admin  | `/admin` (top)   | `components/admin/DataLifecycleManagement/DeletedEntitiesTab.tsx` |
| `/admin/data-lifecycle`                 | Redirect → `/admin/deleted-items`                          | Site admin  | —                | (redirect)                                            |
| `/admin/permissions/users`              | Per-user role assignment                                   | Site admin  | `/admin/permissions` | `pages/admin/permissions/UserRoleManagementPage.tsx` |
| `/people`                               | Browse people                                              | Secretary, site admin | (top)  | `pages/BrowsePeoplePage.tsx`                          |
| `/people/:id`                           | Person detail: hero, properties, tabs, associations (dogs, judge cards, invitation) | Secretary, site admin | `/people` | `pages/PersonDetailPage.tsx` → `components/users/UserDetails/UserDetailsView.tsx` |
| `/users`, `/users/:id`                  | Redirects → `/people`, `/people/:id`                       | —           | —                | (redirects)                                           |

**Non-route detail surface:** `UserEditPanel` (`components/panels/edit/UserEditPanel.tsx`) — a slide-over form with Basic / Contact (+ Qualifications / Availability for judges). It has **no URL** and is mounted from two different places (see Step 4).

**Orphan routes:** none in scope. `/people/:id` is reachable from `/people` and from the `/admin/users` row menu; `/admin/deleted-items` is in the admin sidebar.

**Duplicate-purpose routes:** none at the *route* level. The duplication in this surface is **route vs. non-route** — a person's detail exists both as a page (`/people/:id`) and as a panel (`UserEditPanel`), which is exactly the "modal/inline duplication" case the methodology flags.

**Hierarchy mismatch:** `/people/:id` breadcrumbs as `People → {name}`. When it is entered from `/admin/users`, that breadcrumb is a lie about where the user came from, and there is no path back into `/admin`.

---

## Step 2: Task Flow Walk

**Method note:** walked by tracing components and handlers in the repo, not by driving the live app. Click counts are therefore derived from the code paths, not measured. This is sufficient for structural findings; a live pass should confirm before Phase C.

**Tasks tested:** (1) change a user's phone number, (2) see everything about a person before acting, (3) suspend an account, (4) remove a person, (5) restore a removed person, (6) find out whether a person was ever removed.

### Task 1: Change a phone number

| Step | Action                                | Route          | Friction                                   | Severity |
| ---- | ------------------------------------- | -------------- | ------------------------------------------ | -------- |
| 1    | Search roster, click row               | `/admin/users` | none                                       | None     |
| 2    | Panel opens → Contact tab → Save      | `/admin/users` | none                                       | None     |

**Context switches:** 0. **Verdict:** Completable. This is the surface working as intended.

### Task 2: See everything about a person before acting

| Step | Action                                     | Route          | Friction                                                             | Severity |
| ---- | ------------------------------------------ | -------------- | -------------------------------------------------------------------- | -------- |
| 1    | Click row                                  | `/admin/users` | Opens an **editor**, not a detail view — no dogs, no clubs, no history | High     |
| 2    | Close panel, reopen row menu → Open profile page | `/admin/users` | The information the admin wanted is behind a second, differently-named affordance | High |
| 3    | Land on profile                            | `/people/:id`  | Breadcrumb reads `People → {name}`; admin has left `/admin` with no return path | High     |
| 4    | Return to roster                           | browser Back   | Filters/selection state depend on Back working                        | Medium   |

**Context switches:** 2. **Verdict:** Completable with friction. This is the finding that PR #1553 surfaced.

### Task 3: Suspend an account

| Step | Action                       | Route          | Friction                                                        | Severity |
| ---- | ---------------------------- | -------------- | ---------------------------------------------------------------- | -------- |
| 1    | Row → panel → Basic Info     | `/admin/users` | Account Status sits below name/photo fields, inside an edit form  | Medium   |
| 2    | Select Suspended             | `/admin/users` | `window.confirm` instead of the app's dialog primitives           | Low (UX-Audit) |
| 3    | Save                         | `/admin/users` | A lifecycle action requires saving an edit form                   | Medium   |

**Verdict:** Completable with friction. Suspension is a *lifecycle* action wearing a *profile field* costume.

### Task 4: Remove a person

Two different dialogs, depending on where the admin started:

| Origin              | Dialog                                       | Options offered                              | Guard                            |
| ------------------- | -------------------------------------------- | -------------------------------------------- | -------------------------------- |
| `/admin/users` menu | `AdminDeleteUserDialog`                       | Soft ("Deactivate") **or** Permanent          | Blocks when the person owns live dogs |
| `/people/:id` hero  | Generic `StandardDialog` in `UserDetailsDialogs` | Soft only (`UserService.delete`)           | Receives `ownedDogCount` only     |

**Verdict:** Completable, but the same lifecycle event has two different affordance sets and two different copies. An admin who removes from the profile page cannot reach the permanent option at all.

### Task 5: Restore a removed person

| Step | Action                                              | Route                   | Friction                                                     | Severity |
| ---- | --------------------------------------------------- | ----------------------- | ------------------------------------------------------------ | -------- |
| 1    | Turn on "Include removed users"                     | `/admin/users`          | Removed rows appear with a `Removed` badge                    | None     |
| 2    | Open the row menu on a removed row                  | `/admin/users`          | **No Restore action.** The menu still offers "Delete user…"    | Critical |
| 3    | Navigate to Deleted Items → People → expand → Restore | `/admin/deleted-items`  | No link from the roster; the admin must know this page exists  | High     |

**Verdict:** Completable only if the admin already knows the second page exists. The filter that exists specifically to show removed users cannot act on them.

### Task 6: Was this person ever removed?

`/people/:id` renders no deleted-state banner. A soft-deleted person opened by direct URL looks ordinary. **Verdict:** Broken (silent wrong answer).

---

## Step 3: Mental Model Check

**Method used:** domain-expert grouping (kennel-club platform admin conventions) cross-checked against `docs/INTENT.md` § Site Admin.

**Capabilities in scope:**

- Find a person; filter/sort the roster; bulk-assign roles
- Read a person's full record (contact, roles, dogs, clubs, judge qualifications, sign-in history)
- Edit a person's profile fields
- Assign roles to one person
- Suspend / reinstate an account
- Remove a person (recoverably), permanently delete, restore
- Invite / send a sign-in link

**User mental grouping:**

| Group           | Capabilities                                                     |
| --------------- | ---------------------------------------------------------------- |
| **Find**        | Roster, search, filter, bulk ops                                 |
| **Know**        | Read the full record                                             |
| **Change**      | Edit fields, assign roles, invite                                |
| **Lifecycle**   | Suspend, remove, restore, permanently delete                     |

**Actual route grouping:**

| Location                 | Capabilities surfaced                                                |
| ------------------------ | -------------------------------------------------------------------- |
| `/admin/users`           | Find, bulk ops, Change (via panel), Remove, *partial* Lifecycle (suspend, hidden inside the edit form) |
| `UserEditPanel` (no URL) | Change; suspend; complimentary premium                               |
| `/people/:id`            | Know, Change (**same panel**), Remove (different dialog), Invite      |
| `/admin/deleted-items`   | Restore, permanent delete                                             |
| `/admin/permissions/users` | Assign roles (third path)                                           |

**Mismatches:**

| Capability            | User expects in              | Actually lives in                              | Severity |
| --------------------- | ---------------------------- | ---------------------------------------------- | -------- |
| Know (full record)    | The thing a roster row opens | A separate page outside `/admin`                | High     |
| Restore               | Next to the removed row      | A different page, with no link                  | Critical |
| Suspend / reinstate   | Lifecycle actions menu       | A `<Select>` inside the edit form's Basic tab   | Medium   |
| "Is this person removed?" | The person's own page    | Only visible in the roster, filter permitting   | High     |

**Key structural fact:** the profile page and the roster are *not* two implementations of an editor. `UserDetailsDialogs.tsx:66` mounts the **same `UserEditPanel`**. There is one editor and two shells. The genuine gap is the **read** view: the panel shows form fields; the page shows dogs, clubs, judge cards, invitation state.

---

## Step 4: Duplication & Orphan Scan

**Task duplication:**

| Task                | Paths available                                                        | Recommended consolidation                                          |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Open a person       | Row click → panel; menu "Edit user" → panel; menu "Open profile page" → `/people/:id` | Split by *intent*: row click = **read** (`/people/:id`), menu "Edit user" = **write** (panel). Keep both; stop pointing two affordances at the same panel. |
| Edit a person       | Panel from `/admin/users`; panel from `/people/:id`                    | Already one component — **no change**. This is the pattern to preserve, not to fix. |
| Remove a person     | `AdminDeleteUserDialog`; generic dialog on `/people/:id`               | One dialog (`AdminDeleteUserDialog`) used by both surfaces          |
| Restore a person    | `/admin/deleted-items` only                                            | Add Restore to the removed row's menu; keep Deleted Items as the cross-entity sweep |
| Assign roles        | Panel (roles field); `ManageUserRolesDialog`; `/admin/permissions/users` | Out of scope for this review — flag for a follow-up pass            |

**Modal/inline duplication:** `UserEditPanel` has no URL, so an admin cannot link a colleague to "this person's record" from `/admin/users`. `/people/:id` is the only addressable person surface — an argument for making it the drill-down destination rather than growing the panel.

**Orphan routes:** none.

---

## Step 5: Severity Scoring

| # | Finding | Step | Frequency | Friction | Fix invasiveness | Sum | Priority |
|---|---------|------|-----------|----------|------------------|-----|----------|
| F1 | Removed rows offer no Restore; row menu is identical to a live user's and still offers "Delete user…" | 2, 3 | 4 | 5 | 2 | **11** | **Critical** |
| F2 | Row click opens an editor, not a detail view — "drill down" lands on a form | 2, 3 | 5 | 4 | 2 | **11** | **Critical** |
| F3 | `/people/:id` shows no removed/suspended state banner — a soft-deleted person looks ordinary | 2 | 3 | 5 | 2 | **10** | **High** |
| F4 | Leaving `/admin` for `/people/:id` has no return path; breadcrumb claims a `/people` origin | 2 | 4 | 3 | 3 | **10** | **High** |
| F5 | Two delete dialogs for one lifecycle, with different options and guards | 2, 4 | 3 | 4 | 3 | **10** | **High** |
| F6 | No link between `/admin/users` (incl. its removed-users filter) and `/admin/deleted-items` | 2, 4 | 3 | 3 | 1 | 7 | Medium |
| F7 | Suspend/reinstate lives inside the edit form rather than with lifecycle actions | 2, 3 | 3 | 3 | 3 | 9 | High |
| F8 | Three paths to role assignment (panel, dialog, `/admin/permissions/users`) | 4 | 3 | 3 | 4 | 10 | High *(deferred — own review)* |

**Top 20% to fix next:** F1, F2 (Critical), then F3, F4, F5.
**Documented, not fixed now:** F6 (folds into Phase B cheaply), F8 (needs its own scoped review of the permissions surface — consolidating it here would widen this work past the stated scope).

---

## Step 6: Phased Remediation Plan

**Plan doc:** [`docs/plan-ia-admin-person-detail.md`](plan-ia-admin-person-detail.md)

**The consolidation, in one sentence:** `/people/:id` becomes the canonical person **detail** surface (admins do leave `/admin` — with a breadcrumb that says so), `UserEditPanel` stays the single shared **editor** mounted from both shells, and the soft-delete lifecycle gets one dialog plus a Restore action wherever a removed row is visible.

**Why not the alternative** (grow the panel until `/admin` never links out): it would re-implement dogs, clubs, judge cards, and invitation state inside a slide-over that has no URL — the exact "does this duplicate an existing page?" failure CLAUDE.md § "consolidate, don't duplicate" rules out. The editor is *already* shared; the cheap win is to fix the return path, not to rebuild the destination.

**Phase summary:**

| Phase | Scope | Entry trigger | Exit criterion | Est. PRs |
| ----- | ----- | ------------- | -------------- | -------- |
| **A** | F1 + F6 — lifecycle actions on removed rows: Restore / Delete permanently replace the live-user menu; toast links to Deleted Items | Approved plan | A removed row can be restored without leaving `/admin/users`; tests cover menu-by-state | 1 |
| **B** | F2 + F4 — row click drills into `/people/:id`; origin-aware breadcrumb returns to `/admin/users` with filters intact; "Edit user" remains the panel | Phase A merged | Row click lands on the profile page; breadcrumb reads `Admin → Users → {name}` when entered from `/admin` | 1 |
| **C** | F3 + F5 — one delete dialog for both shells; removed/suspended banner with Restore on `/people/:id` | Phase B merged | Both shells open `AdminDeleteUserDialog`; a soft-deleted person's page states it and offers Restore | 1 |
| **D** | F7 — lifecycle actions (suspend/reinstate) move out of the edit form | Phase C merged | Suspend is reachable from the row menu and the profile page; the panel no longer owns account status | 1 |

---

## Summary

**Overall IA health:** Needs Work — one Critical dead end, one Critical mental-model mismatch, but no architectural rewrite required.

**Top 3 findings:**

1. **F1** — the "Include removed users" filter shows removed people the admin cannot act on; Restore lives on an unlinked page. **Critical**
2. **F2** — clicking a roster row opens an editor, so "drill down to detail" (INTENT § Site Admin) lands on a form with no dogs, clubs, or history. **Critical**
3. **F3** — `/people/:id` never says a person is removed, so the profile page can silently answer "is this person active?" wrong. **High**

**Recommended next phase:** Phase A — put Restore and Delete-permanently on removed rows, and link the roster to Deleted Items. Smallest change, closes the only Critical dead end, unblocks nothing else.

**Total estimated remediation effort:** 4 PRs across Phases A–D. F8 (role-assignment triplication) is deliberately excluded and needs its own review.
