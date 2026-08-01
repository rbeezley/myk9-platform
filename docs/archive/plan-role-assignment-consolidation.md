# Role Assignment Consolidation — one place to grant, one place to read

> **Status:** Complete

**Date:** 2026-08-01
**Origin:** IA finding from the impeccable-playbook run on `/admin/users` ([#1553](https://github.com/rbeezley/myk9-platform/pull/1553)), whose scope was deliberately mechanical-only. IA was left for this document.
**Roles affected:** Site Admin only.

---

## 1. The duplication question

> _Does this duplicate an existing page? If so, why is duplication justified instead of a link?_

Yes, and it is not justified. Four surfaces write `public.user_roles`, with three different capability sets:

| Surface                                                                                    | Grain      | Club scope      | Show scope | Expiry  | Reachable from                                  |
| ------------------------------------------------------------------------------------------ | ---------- | --------------- | ---------- | ------- | ----------------------------------------------- |
| `/admin/users` → `ManageUserRolesDialog` (`UserManagementPage.tsx:363`)                    | person     | yes, multi-club | no         | no      | sidebar                                         |
| `/admin/users` → `BulkRoleDialog` (`BulkActionsBar.tsx:238`)                               | person × N | yes             | no         | no      | sidebar                                         |
| `/admin/permissions/users` → `UserRoleAssignmentDialog` (`UserRoleManagementPage.tsx:509`) | grant      | yes             | **yes**    | **yes** | not in sidebar; 2 cards on `/admin/permissions` |
| `/admin/role-requests` → `approve_role_request` RPC (`RoleRequestsPage.tsx:88`)            | grant      | yes             | yes        | no      | sidebar                                         |

The first two and the third answer the same user question — "give this person a role" — with different powers, so which page the admin happens to open changes what they can grant. That is the defect.

### Three concrete symptoms

1. **The support deep-link is dead.** `supportDiagnosticActions.ts:146` sends the admin to `/admin/permissions/users?userId=<id>`, but `UserRoleManagementPage` never calls `useSearchParams` — the parameter is dropped and the admin lands on an unfiltered ledger. `UserRoleAssignmentDialog` accepts a `preselectedUserId` prop that nothing ever passes.
2. **A mislabelled card.** `PermissionManagementPage.tsx:94` renders "Your Active Roles" and links to a page listing _everyone's_ roles.
3. **The extra capability is vestigial.** Live staging `public.user_roles` (queried 2026-08-01): **26** grants, **0** with `expires_at`, **0** show-scoped, 7 club-scoped, 1 inactive. The only thing `/admin/permissions/users` can do that `/admin/users` cannot has never been used.

### Intent check

`docs/INTENT.md` § Site Admin asks for _"Managing users/clubs → 'Standard operations' → Bulk actions, search, filters — efficient for power users."_ That describes a **roster**, not a grant ledger. It also asks for _"Investigating an issue → 'I can drill down' → Clear path from summary to detail"_ — which the dead `?userId=` link currently breaks.

---

## 2. Decision

**`/admin/users` owns granting. `/admin/permissions` owns reading and revoking.**

- `/admin/users` is the only surface that **grants** roles — single (`ManageUserRolesDialog`) and bulk (`BulkRoleDialog`).
- `/admin/permissions` gains an **Assignments** tab: the read-only grant ledger, with revoke. Revoke is the ledger's natural verb and stays.
- `/admin/role-requests` keeps its server-side grant via `approve_role_request`. It is a queue action on a specific request, not a general assignment surface, so it is not a duplicate.
- `/admin/permissions/users` stops existing as a page and becomes a redirect.

Rejected alternative — deleting `/admin/permissions/users` outright and redirecting to `/admin/users`: the roster renders neither scope nor expiry, so a show-scoped grant written by `approve_role_request` would become invisible in every UI. Approach A keeps one surface that can show it.

Precedent for the demotion: `/admin/permissions/audit` is already a pageDirectory entry marked `classification: 'park'` with the description "(tabbed into Permissions page)".

---

## 3. Design

### 3.1 Demote the page to a tab

Extract the assignments table, role-summary cards, and revoke-confirm dialog out of `pages/admin/permissions/UserRoleManagementPage.tsx` (519 lines) into `components/admin/permissions/RoleAssignmentsPanel.tsx`.

Mount it as a fourth tab on `PermissionManagementPage` via the existing `useUrlTab` hook: `overview | assignments | permissions | audit`.

The panel **loses** its "Assign Role" button. `components/admin/permissions/UserRoleAssignmentDialog.tsx` (324 lines) is deleted. In its place the panel toolbar carries a link: "Assign roles from **User Management**" → `/admin/users`.

`pages/admin/permissions/UserRoleManagementPage.tsx` is deleted once the panel is extracted.

### 3.2 Redirect, do not delete, the route

`adminRoutes.tsx` keeps the path, serving a redirect:

```tsx
<Route
  path="/admin/permissions/users"
  element={<Navigate to="/admin/permissions?tab=assignments" replace />}
/>
```

Three lines, and every bookmark, pageDirectory link, and support-action href that already points there keeps working.

### 3.3 Do not lose scope and expiry

Because `approve_role_request` can write show-scoped grants that `ManageUserRolesDialog` cannot render, the dialog gains a read-only **"Other grants"** block: any of that user's `user_roles` rows with `show_id IS NOT NULL` or `expires_at IS NOT NULL`, each labelled with its scope and a link to `/admin/permissions?tab=assignments`.

The block renders **only when such rows exist** — zero today, so it is invisible until it matters. This is the piece that keeps the consolidation from silently hiding data.

### 3.4 Fix the dead deep-link

`supportDiagnosticActions.ts` repoints the `user-roles` action and the `permissions-users` next-check to `/admin/users?userId=<id>` (and `/admin/users` when no id is known).

`UserManagementPage` reads the `userId` search parameter: once the roster query resolves, if a matching user is present, open `ManageUserRolesDialog` for them. An id with no matching user is a no-op — no crash, no error toast, the admin simply sees the roster.

The support action then lands on the affordance that resolves it, per INTENT's _"Readiness chips land on the fix"_ guardrail.

### 3.5 Cross-links

| From                              | To                     | Form                                                                 |
| --------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `/admin/users` page header        | `/admin/role-requests` | "Role requests" header action                                        |
| `/admin/permissions` quick action | `/admin/users`         | "Assign User Roles" card repointed (was `/admin/permissions/users`)  |
| `/admin/permissions` stat card    | `?tab=assignments`     | "Your Active Roles" becomes a platform-wide "Role Assignments" count |
| `/admin/role-requests`            | `/admin/users`         | already exists (`RoleRequestsPage.tsx:133`) — unchanged              |

### 3.6 Directory and registry

- `pageDirectory.ts`: `/admin/permissions/users` → `classification: 'park'`, description "(tabbed into Permissions page)", mirroring the audit entry. `/admin/users` gains `linksTo: ['/admin/role-requests']`. `/admin/role-requests` gains `linksTo: ['/admin/users']`.
- `routeRegistry.ts:179`: drop the retired path from the `permissionManagement` prefetch group.

---

## 4. Files touched

**Deleted**

- `pages/admin/permissions/UserRoleManagementPage.tsx`
- `components/admin/permissions/UserRoleAssignmentDialog.tsx`

**Added**

- `components/admin/permissions/RoleAssignmentsPanel.tsx`
- `components/admin/permissions/__tests__/RoleAssignmentsPanel.test.tsx`

**Modified**

- `pages/admin/permissions/PermissionManagementPage.tsx` — fourth tab, quick-action link, stat card
- `pages/admin/UserManagementPage.tsx` — `userId` param, Role Requests header action
- `components/admin/permissions/ManageUserRolesDialog.tsx` — "Other grants" read-only block
- `pages/admin/supportDiagnosticActions.ts` — repointed hrefs
- `routes/adminRoutes.tsx` — redirect route
- `routes/routeRegistry.ts` — prefetch group
- `features/admin-help/data/pageDirectory.ts` — classification and `linksTo`

---

## 5. Testing phase

A phase is not complete until its tests pass.

| #   | Test                                                                                                 | Location                                                                |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Assignments panel renders rows, role summary, and revoke confirm (rewrite of the existing page test) | `components/admin/permissions/__tests__/RoleAssignmentsPanel.test.tsx`  |
| 2   | Panel exposes no assign affordance; the toolbar link targets `/admin/users`                          | same file                                                               |
| 3   | `/admin/permissions/users` redirects to `/admin/permissions` with the assignments tab active         | `pages/admin/permissions/__tests__/`                                    |
| 4   | `/admin/users?userId=<id>` opens `ManageUserRolesDialog` for that user                               | `pages/admin/__tests__/UserManagementPage.deepLink.test.tsx`            |
| 5   | `/admin/users?userId=<unknown>` is a no-op — roster renders, no dialog, no error                     | same file                                                               |
| 6   | "Other grants" block renders show-scoped and expiring rows, and is absent when none exist            | `components/admin/permissions/__tests__/ManageUserRolesDialog.test.tsx` |
| 7   | Support diagnostic actions emit the new `/admin/users?userId=` href                                  | `pages/admin/supportDiagnosticActions.test.ts` (update)                 |
| 8   | Route health covers `/admin/permissions?tab=assignments`                                             | `test/e2e/route-health-by-role.spec.ts` (update)                        |

**Deleted test:** `pages/admin/permissions/__tests__/UserRoleManagementPage.table.test.tsx` — superseded by #1.

**Registration reminder (LESSONS):** new test files must be added to the runner allowlist where one applies. These are app unit tests under `apps/myk9show`, picked up by the standard vitest config — no allowlist entry needed — but verify with `pnpm vitest run <path>` and then a full `cd apps/myk9show && pnpm test` before opening the PR.

**Gate:** `pnpm typecheck` and `pnpm lint` across the monorepo, plus the myK9Show unit suite. CI is authoritative.

---

## 6. Risks

| Risk                                                                       | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deleting `UserRoleAssignmentDialog` removes the only UI able to set expiry | Accepted: 0 rows use it. `approve_role_request` and direct SQL remain. Reopen if a real need appears.                                                                                                                                                                                                                                                                                                                                                                            |
| An admin's muscle memory for `/admin/permissions/users` breaks             | Redirect preserves the URL; the tab is one click from the same hub                                                                                                                                                                                                                                                                                                                                                                                                               |
| Show-scoped grants become invisible                                        | § 3.3 "Other grants" block is specifically the guard against this                                                                                                                                                                                                                                                                                                                                                                                                                |
| Show-scoped grants are silently destroyed                                  | **Partly mitigated.** `ManageUserRolesDialog` now locks any role holding a grant it cannot edit, so the single-user path cannot wipe one. `BulkRoleDialog` on the same page still revokes without a scope filter (`bulkRoleRunner.ts` `replaceRolesForUser` / `removeRolesFromUser` never read `show_id` or `expires_at`), so bulk **Replace** or **Remove** can still destroy such a grant. Zero such rows exist in live data; tracked as a follow-up, not closed by this plan. |
| `ManageUserRolesDialog` grows past a comfortable size with the new block   | It is 370 lines; the block is small. If it passes 500, extract `OtherGrantsList` as a sibling.                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 7. Out of scope

- Changing `approve_role_request` or any RLS/grant behaviour. This is a pure IA and UI change; no migration.
- Redesigning `BulkRoleDialog` or `ManageUserRolesDialog` beyond the read-only block in § 3.3.
- Touching `/admin/rbac-test`, `/admin/permissions/roles`, or the audit tab.
