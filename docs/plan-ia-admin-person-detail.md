# Plan: Admin Person Detail + Soft-Delete Lifecycle Consolidation

> **Status:** Active

**Source audit:** [`docs/ia-review-admin-person-detail.md`](ia-review-admin-person-detail.md) — read it first; findings are cited below by ID (F1–F8).
**Origin:** structural follow-up to PR #1553, which renamed the `/admin/users` row affordances (mechanical scope) and deferred the structural question.

## The decision this plan encodes

Three affordances on `/admin/users` resolve to two destinations. The fix is **not** to collapse them to one, and **not** to grow the panel until `/admin` is self-sufficient. It is to split them by intent:

| Affordance                     | Intent | Destination                                                     |
| ------------------------------ | ------ | --------------------------------------------------------------- |
| Row click                      | read   | `/people/:id` (canonical detail)                                |
| Row menu → "Edit user"         | write  | `UserEditPanel` in place                                        |
| Row menu → "Open profile page" | read   | `/people/:id` (keyboard/discoverability path for the row click) |

**Yes, the admin leaves `/admin` to see a person** — deliberately. `/people/:id` already holds dogs, clubs, judge qualifications, and invitation state; rebuilding those inside a URL-less slide-over would duplicate a working page, which CLAUDE.md § "consolidate, don't duplicate" rules out. The cost of leaving is the missing return path, and that is cheap to fix (Phase B).

**The editor is already shared.** `components/users/UserDetails/UserDetailsDialogs.tsx:66` mounts the same `UserEditPanel` as `/admin/users`. No editor work is needed — preserve this.

**Soft-delete gets one lifecycle, three linked surfaces:** the roster acts on removed rows it already displays (Phase A), the profile page states removed status and offers Restore (Phase C), and `/admin/deleted-items` stays as the cross-entity sweep, now linked from the roster.

## Out of scope

- **F8 — three paths to role assignment** (`UserEditPanel` roles field, `ManageUserRolesDialog`, `/admin/permissions/users`). Real duplication, but consolidating it means auditing the whole permissions surface. Needs its own IA review.
- Visual/copy polish beyond what a phase touches → `UX-Audit`.
- The `window.confirm` in the suspend flow — folded into Phase D rather than fixed standalone.

---

## Phase A — Lifecycle actions on removed rows (F1, F6)

**Entry trigger:** this plan approved.

**Scope:**

1. `UserTable/RowActions.tsx` takes the row's deleted state and renders a state-appropriate action set:
   - Live user: Open profile page · Edit user · Manage roles · Delete user…
   - Removed user: Open profile page · **Restore** · **Delete permanently…** (no Edit, no Manage roles — editing a removed person is not a real operation)
2. Restore calls the existing restore path used by `DeletedEntitiesTab` for `people` — `restoreUser` in `services/database/users` (an admin-gated `restore_person` RPC). No extraction was needed; both surfaces call the same function.
3. The post-delete toast ("… was removed. Restore from Deleted Items.") gains an action that navigates to `/admin/deleted-items`.
4. `UserFilters`' "Including removed users" summary chip links to `/admin/deleted-items`.

**Testing (phase is not complete until these pass):**

- `RowActions` unit tests: action IDs for a live user vs. a `deletedAt` user; assert `edit`/`roles` absent and `restore` present on removed rows.
- Restore-service unit test: roster restore and Deleted Items restore call the same function.
- Existing `UserTable`/`UserManagementPage` suites stay green.
- `pnpm --filter myk9show test` + `pnpm typecheck` + `pnpm lint`.

**Exit criterion:** with "Include removed users" on, a removed person can be restored without leaving `/admin/users`, and no menu offers an action that does not apply to the row's state.

---

## Phase B — Row click drills into detail (F2, F4)

**Entry trigger:** Phase A merged.

**Scope:**

1. `UserManagementPage.handleUserClick` navigates to `/people/:id` instead of opening the panel. "Edit user" keeps opening the panel; "Open profile page" keeps navigating (now the same target as the row click — retained as the discoverable/keyboard path).
2. Origin-aware breadcrumb on `/people/:id`: when entered from `/admin/users`, render `Admin → Users → {name}`; otherwise the existing `People → {name}`. Pass origin via router state (not a query param — it is navigation context, not addressable state, and must not leak into shared URLs).
3. Returning to `/admin/users` preserves roster filters and selection. Verify the existing selection-restore logic (`UserManagementPage.tsx:88`) survives a real navigation, not just a panel close — if it does not, persist filters in the URL.

**Testing:**

- `UserManagementPage` test: row click navigates to `/people/:id`; "Edit user" opens the panel and does not navigate.
- Breadcrumb test: admin origin renders the admin trail; direct visit renders the `/people` trail.
- Filter-preservation test across navigate-away/navigate-back.
- E2E (`apps/myk9show/e2e`): site admin filters the roster, opens a person, returns, and finds the filter intact. Register the spec in the runner allowlist — this repo's runners use hand-maintained lists, not globs.

**Exit criterion:** clicking a roster row lands on the person's full record with a breadcrumb that names where the admin came from and returns there with filters intact.

---

## Phase C — One delete dialog, and a page that admits removal (F3, F5)

**Entry trigger:** Phase B merged.

**Scope:**

1. `/people/:id` replaces its generic `StandardDialog` delete with `AdminDeleteUserDialog`, so both shells offer the same options (soft/permanent) and the same owns-live-dogs guard. Permission-gate the permanent option to `admin:manage`; a secretary on `/people/:id` sees soft delete only.
2. `/people/:id` renders a removed-state banner when `deletedAt` is set: what happened, when, and a Restore action (same shared service as Phase A). Suspended accounts get the equivalent treatment.
3. The `/admin/deleted-items` People section links each entry to `/people/:id`.

**Testing:**

- `UserDetailsView` tests: banner renders for a soft-deleted person; absent for a live one; Restore calls the shared service.
- Dialog test: permanent option hidden without `admin:manage`; owns-live-dogs guard blocks from both entry points.
- Existing `AdminDeleteUserDialog` and `DeletedEntitiesTab` suites stay green.

**Exit criterion:** a soft-deleted person's page says so and can be restored from there; deleting a person offers the same choices from either shell.

---

## Phase D — Lifecycle out of the edit form (F7)

**Entry trigger:** Phase C merged.

**Scope:**

1. Suspend/reinstate moves from the `UserEditPanel` Basic Info tab to the lifecycle action set: row menu on `/admin/users` and the hero actions on `/people/:id`.
2. Replace `window.confirm` with the app's dialog primitive; keep the "cannot suspend your own account" guard and its copy.
3. `UserEditPanel` stops owning account status. Confirm nothing else reads the form's `status` field before removing it.

**Testing:**

- Panel test: no account-status control; saving does not clear status.
- Row-menu + hero tests: suspend/reinstate present per permission and per current state; self-suspension blocked.
- Full app suite + typecheck + lint.

**Exit criterion:** account status is changed through a lifecycle action, never by saving a profile form.

---

## Sequencing notes

- Phases are strictly ordered: B changes what a row click does, which Phase A's tests assume is still the panel; C's banner reuses A's restore service; D moves an action into menus that B and C have settled.
- Each phase is one PR, each PR gets a Codex review (CLAUDE.md § review policy).
- No migrations, no RLS changes, no edge functions — this is entirely client-side IA work against existing services.

## Change log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                       | Source       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 2026-08-01 | Plan produced from the IA review; scope excludes F8 (role-assignment paths)                                                                                                                                                                                                                                                                                                                                                  | This session |
| 2026-08-01 | Phase A implemented. Two deviations: (a) the row menu's old "Manage roles falls back to the profile page when no handler is passed" behaviour was dropped — a menu item labelled _Manage roles_ that opens a profile page is a lie; it is now omitted instead. (b) A **removed** row's click opens the profile page rather than the edit panel, so the row agrees with its own menu. Live rows keep the panel until Phase B. | This session |
