# Fix Plan — Stop the `select('*')` people fetch on every login (SA-008)

> **Status:** Active

Covers **SA-008** from [`../security-audit-2026-07-03.md`](../security-audit-2026-07-03.md):
`App.tsx:177-197` (UserDataInitializer → `store.loadUsers()`) runs
`supabase.from('people').select('*, user_roles..., judge_qualifications(...)')` with
no column allowlist and no caller-role gate — for **every** signed-in user,
including plain exhibitors (`apps/myk9show/src/services/database/users/reads.ts:20-25`).

## Why this is MEDIUM and why it needs a decision

Today it's contained: the `people` SELECT RLS policy is `is_show_manager()`-gated
(mig `20260611120000`), so an exhibitor's `select('*')` returns few rows. **The risk
is latent** — the client leans entirely on that policy. Any future loosening of
`people_select` (e.g. to support a new sharing feature) silently turns this call into
a full-PII directory dump (`people.*` = email/phone/address) shipped to every
browser on login. It's also pointless bandwidth for exhibitors who never use the
user store.

The fix is a decision, not a mechanical edit, because **which surfaces actually
depend on the populated `userStore`** determines whether `loadUsers()` should be
gated, lazy-loaded, or scoped — get it wrong and an admin picker goes empty.

## Step 1 — Map `userStore` consumers

Grep for reads of the store `loadUsers()` populates (`useUserStore`, the users slice)
and classify:
- Admin/secretary surfaces that genuinely need a people directory (owner pickers,
  user management, judge assignment). These are role-gated already.
- Anything an exhibitor session touches. Expected: **none** — an exhibitor has no
  reason to hold the full people list.

## Step 2 — Choose the fix (two independent halves)

1. **Gate the fetch** — move `loadUsers()` out of the unconditional
   `UserDataInitializer` and behind the admin/secretary surfaces that need it
   (lazy-load on entering those routes, or condition on the resolved role). An
   exhibitor session should not fire it at all.
2. **Column allowlist** — replace `select('*')` with an explicit column list
   (id, first/last name, and only the contact columns a consumer actually renders).
   Even for admins, don't ship `people.*` when a picker needs four fields. Keep the
   `user_roles`/`judge_qualifications` joins only if a consumer uses them.

Both halves are worth doing; (2) is the defense-in-depth that survives an RLS
regression, (1) is the bandwidth + least-privilege win.

## Step 3 — (Optional, recommend) belt-and-suspenders on the policy

Not required by this finding, but note for the role-map/RLS track: consider whether
`people_select` should mask `email`/`phone` on rows a viewer can see but doesn't own
(the 2026-06-11 review flagged this as an accepted pre-launch trade-off). Out of
scope here; cross-link only.

## Testing phase (assertion-first — gate for completion)

- **Fetch-gating test** — render the app initializer as an exhibitor role (custom
  render from `src/test/utils/testUtils.tsx`); assert `loadUsers`/the `people` query
  is **not** called (assert the spy has zero calls — write it red against current
  behavior). As an admin, assert it *is* called.
- **Column-shape test** — assert the query builder is called with the explicit column
  list, not `'*'` (assertion-first: `expect(select).toHaveBeenCalledWith(<list>)`,
  per the repo's value-sensitive convention).
- `pnpm typecheck` + `pnpm lint` + `cd apps/myk9show && pnpm test` green. No
  migration (client-only change) unless the optional Step 3 is taken (then it's a
  separate migration PR + auditor).

## Done criteria

Exhibitor sessions no longer fetch the people table on login; admin/secretary
surfaces that need the directory still populate it, with an explicit column list
instead of `*`. Proven by the two tests above.
