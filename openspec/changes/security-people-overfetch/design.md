## Context

`UserDataInitializer` fires `loadUsers()` unconditionally for every signed-in
session. The underlying query
(`apps/myk9show/src/services/database/users/reads.ts:20-25`) is
`supabase.from('people').select('*, user_roles..., judge_qualifications(...)')`
with no column allowlist and no caller-role gate. Today the `people_select` RLS
policy (`is_show_manager()`-gated, mig `20260611120000`) contains the blast
radius — an exhibitor's `select('*')` returns few rows — but the client behavior
itself is latent risk: it assumes the policy will always be at least this strict.
Evidence: `docs/security-audit-2026-07-03.md` SA-008 (MEDIUM).

## Goals / Non-Goals

**Goals:**
- Stop exhibitor sessions from firing the `people` fetch at all.
- Replace `select('*', ...)` with an explicit column list wherever the fetch
  still runs, scoped to what each consuming surface renders.
- Preserve every admin/secretary surface that genuinely needs a people directory
  (owner pickers, user management, judge assignment) with no regression.

**Non-Goals:**
- Masking `email`/`phone` at the RLS layer for rows a viewer can see but doesn't
  own — noted in the source plan as a separate, already-accepted pre-launch
  trade-off; cross-link only, not part of this change.
- Any UI redesign of the surfaces that consume the people directory.

## Decisions

1. **Gate by consumer, not by blanket role check** — map every reader of the
   `userStore`/users slice populated by `loadUsers()`, then move the call behind
   the specific admin/secretary routes that need it (lazy-load on route entry),
   rather than adding a single global "if admin" condition in
   `UserDataInitializer`. *Alternative considered:* a single role gate in the
   initializer — acceptable as an interim if the consumer map shows exactly one
   gate point suffices; prefer per-route lazy-load if consumers are spread across
   multiple distinct surfaces, since a single gate can silently reintroduce the
   fetch for a broader population than intended as new consumers are added.
2. **Column allowlist applies even to admin fetches** — don't ship `people.*`
   to admins either when a picker needs four fields; keep the
   `user_roles`/`judge_qualifications` joins only where a consumer actually uses
   them. *Alternative considered:* allowlist only for non-admin fetches —
   rejected, defense-in-depth should not depend on caller role.
3. **Do both halves in one change** — fetch-gating (bandwidth + least-privilege)
   and column-allowlisting (survives an RLS regression) are independent but both
   required by the finding; shipping only one leaves the other risk open.

## Risks / Trade-offs

- [Gating the fetch behind specific routes breaks an admin picker that expected
  the store to be pre-populated at login] → Mitigation: the consumer-mapping step
  runs first and lists every genuine consumer before any gating code is written;
  each listed consumer gets its own lazy-load trigger, not removed.
- [Column allowlist omits a field a consumer actually renders] → Mitigation:
  derive the column list from actual JSX/render usage per consumer, not from
  guessing; the column-shape assertion test pins the exact list used.
- [No RLS change is made, so the fetch-gating and allowlist are purely
  client-side defense-in-depth] → Mitigation: this is accepted by design (Step 3
  of the source plan is explicitly out of scope here); the policy-masking
  follow-up remains cross-linked for the role-map/RLS track.

## Migration Plan

1. Grep for all `useUserStore`/users-slice consumers; classify each as
   admin/secretary-only or (expected: none) exhibitor-reachable.
2. Move `loadUsers()` out of the unconditional initializer to lazy-load behind
   each classified admin/secretary consumer.
3. Replace `select('*', ...)` with the explicit column list derived from actual
   consumer usage.
4. No database migration; purely a client change, no deploy coupling.
5. Rollback: revert the client commit; no schema state to unwind.

## Open Questions

- Are there any exhibitor-reachable consumers of `userStore`'s people data today?
  (Expected: none — confirm during mapping, not assume.)
