## Why

`App.tsx:177-197` (`UserDataInitializer` → `store.loadUsers()`) runs an
unconditional `select('*', ...)` against `people` for every signed-in user,
including plain exhibitors (SA-008, `docs/security-audit-2026-07-03.md`). Today
it's contained by the `is_show_manager()`-gated `people_select` RLS policy, but the
client leans entirely on that policy holding — any future loosening of
`people_select` silently turns this into a full-PII directory dump
(email/phone/address) shipped to every browser on login. It's also unnecessary
bandwidth for exhibitor sessions that never touch the resulting user store.

## What Changes

- Map every consumer of `userStore`'s `loadUsers()`-populated data to confirm no
  exhibitor-facing surface depends on it.
- Gate the fetch: move `loadUsers()` out of the unconditional
  `UserDataInitializer` and behind the admin/secretary surfaces that actually
  need a people directory (lazy-load on route entry or condition on resolved
  role) — an exhibitor session should not fire this query at all.
- Column-allowlist the fetch: replace `select('*', ...)` with an explicit column
  list scoped to what consuming surfaces actually render, keeping the
  `user_roles`/`judge_qualifications` joins only where used.

## Capabilities

### New Capabilities
- `people-fetch-gating`: role-conditioned loading of the people directory so
  exhibitor sessions never fetch it (SA-008 defense-in-depth half 1).
- `people-fetch-column-allowlist`: explicit column selection replacing
  `select('*')` on the people-directory fetch (SA-008 defense-in-depth half 2).

### Modified Capabilities
(none)

## Impact

- Client only: `apps/myk9show/src/App.tsx` (UserDataInitializer),
  `apps/myk9show/src/services/database/users/reads.ts:20-25`, and the consuming
  `useUserStore`/users slice. No migration required unless the optional
  policy-masking follow-up (out of scope here) is taken.
- Tests: fetch-gating test asserting zero calls for exhibitor role, explicit
  column-shape assertion (`toHaveBeenCalledWith(<list>)`) per the repo's
  assertion-first, value-sensitive convention.
- Fall 2026 launch: closes a latent MEDIUM finding and reduces unnecessary
  bandwidth for the largest user population (exhibitors) before real show-day
  traffic. No new UI surface — a fetch-shape change, not a page — so no
  duplication/link question applies.

Full technical detail: `docs/security-audit-2026-07/plan-people-overfetch.md`.
