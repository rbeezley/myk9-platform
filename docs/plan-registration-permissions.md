# Registration permissions: scope check that fails closed (MYK9-2352)

> **Status:** Active

Design only. No code is written in this PR; the fix follows once the owner picks an option.

## The existing design and why

`useRegistrationPermissions().can(permission, scope?)` (`apps/myk9show/src/hooks/useRegistrationPermissions.ts`) answers two questions in order:

1. **Does the user hold the permission?** From `userWithRoles.permissions`, plus a role fallback: SECRETARY, CLUB_ADMIN and SITE_ADMIN get the mail-in permissions even when older RBAC rows are not yet backfilled (comment on `can`, `MAIL_IN_ENTRY_ROLES`).
2. **Is the scope allowed?** Only when a `scope` is passed. Secretary and club admin are scoped roles, so their scope list must contain the asked club or show.

History: `git log -S"scopedRoles"` reaches only the file's monorepo import (`35c3a1d4b`, Phase 2.1) and a squashed commit that carries the whole file (`da915644d`); this clone's history cannot show the block ever being revised, and no commit records a rationale beyond its shape. Sibling code that does this properly: `utils/roleScopes.ts` (`hasScopedClubRole`, `canManageShowSurface`), which matches `scopeType`, `scopeId` AND `roleId`, and `canRegisterForShow` in the same hook, which already short-circuits SITE_ADMIN first.

## The two defects, from code

Both are in the block at the end of `can` (lines 74-83).

1. **SITE_ADMIN with a secondary club role is locked out.** Roles `[SITE_ADMIN, SECRETARY]` with `scopes = [club A]`. `scopes.length > 0`, `hasScope` (named for "holds a scoped role") is true, so the result is `scopes.some(club A)`. `can(perm, {club, B})` returns `false` for a role that should reach every club.
2. **A scoped role with no scopes fails open.** Roles `[SECRETARY]`, `scopes = []`. The `if` needs `scopes.length > 0`, so it is skipped and `can(perm, anyScope)` returns `true`. Scoped rights with no scope are wider than any scope.

## Reach today (the weighing depends on this)

`can` with a scope has **no production caller**. `can(permission, scope)` is reached only through `components/auth/PermissionGuard.tsx`, and every real use of that guard (`RegistrationManagementPanel`, `PaymentMethodSelector`, `StaffPaymentChoices`, `SecretaryPaymentManagement`) passes `permission` and `role`, never `scope`. The only `scope=` is in the guard's JSDoc example. `RegistrationContext` and the hook's own `canX` helpers call `can(permission)` unscoped. The generic `scope` props in `rbac-hocs.tsx` and `components/rbac/PermissionGuard.tsx` go through a different checker (`hasPermission`), not this hook. So neither defect is reachable in the product today; the risk is a future caller who trusts the documented API.

## Options

- **A. Do nothing.** Zero risk today and zero cost. Rejected: the guard's own docs advertise `scope`, and the first caller inherits a fail-open check on a payments and armband surface. A security-shaped trap left for later is the kind this repo has been bitten by.
- **B. Delete the scope parameter** (and the JSDoc example). Matches "deletions are a feature" and removes both defects with no behavior change, since nothing passes a scope. Cost: if a club-scoped registration check is wanted later, it must be rebuilt, and it would be rebuilt from this same shape.
- **C. Reuse an existing helper, whole.** `hasScopedClubRole` / `canManageShowSurface` take a viewer, a role and an id, not a generic `Scope`, and do not express "any scoped role" or the SITE_ADMIN bypass. Adopting them as the entire fix means widening their signatures. More churn than the defect warrants, so D calls them from inside `can` instead (step 2).
- **D. Fix in place, built on the existing helpers (recommended).** The API stays honest and the scope rule stays the repo's one rule:
  1. If the user holds SITE_ADMIN, return `true` before any scope work.
  2. If the user holds a scoped role (SECRETARY or CLUB_ADMIN), the scope must be carried by a grant OF THAT ROLE, never by any grant at that id. Reuse `utils/roleScopes.ts`: for a club scope, `hasClubAdminGrant(user, { clubId })` (which also accepts a show-pinned club-admin grant that carries the owning `clubId`, as the server does) or `hasClubSecretaryGrant(user, clubId)` (a club-level grant only, and it accepts `trial_secretary`, matching `is_trial_secretary`; `hasScopedClubRole` would miss that name); for a show scope, `hasScopedShowRole(user, role, id)` for each scoped role held. No match, including an empty `scopes`, is `false`. The `scopes.length > 0` guard goes away. A bare `{type, id}` comparison is wrong: a secretary for Show A who is only a judge at Show B would pass `can(MARK_PAYMENT, showB)`, and a show-pinned club admin would be denied their own club.
  3. Otherwise (exhibitor, judge and others, which have no scope concept) keep returning `true`, unchanged.

Recommendation: **D**. B is the better answer if the owner would rather not carry a scope API nobody uses; say so on the PR and it becomes a deletion instead.

## Behavior table after D

| Roles                  | Scopes                               | Scope asked | Result                                    |
| ---------------------- | ------------------------------------ | ----------- | ----------------------------------------- |
| SITE_ADMIN             | any                                  | any         | `true`                                    |
| SITE_ADMIN + SECRETARY | club A                               | club B      | `true` (was `false`)                      |
| SECRETARY              | club A                               | club A      | `true`                                    |
| SECRETARY              | club A                               | club B      | `false`                                   |
| SECRETARY + JUDGE      | secretary at show A, judge at show B | show B      | `false` (grant is not a secretary grant)  |
| CLUB_ADMIN             | show-pinned grant on show S, club C  | club C      | `true`                                    |
| CLUB_ADMIN             | show-pinned grant on show S, club C  | club D      | `false`                                   |
| CLUB_ADMIN             | none                                 | any         | `false` (was `true`)                      |
| SECRETARY              | show-only grant on show S            | club of S   | `false` (server needs a club-level grant) |
| EXHIBITOR              | none                                 | any         | `true` (unchanged)                        |
| any                    | any                                  | none passed | permission check only (unchanged)         |

## Non-goals

No change to `canRegisterForShow`, the mail-in role fallback, `roleScopes.ts`, or the other guard's `hasPermission` path. Unscoped calls, which are every real call, behave exactly as before.

## Testing phase

New `src/hooks/__tests__/useRegistrationPermissions.test.tsx`, rendered with the project's `renderHook` helper and a mocked `useAuthContext`: each row of the table above (fixtures built with `roleId` and `clubId` on the scope grants), plus a missing permission with a matching scope (`false`) and a user with no auth context (`false`). Assertion-first: write the SITE_ADMIN and empty-scope cases, run them red, then change `can`. Also run `pnpm vitest related src/hooks/useRegistrationPermissions.ts --run`, `pnpm vitest run src/test/ci`, `typecheck:app`, `typecheck:tests`, `lint:changed`, then `pnpm typecheck` and `pnpm lint` from the root.
