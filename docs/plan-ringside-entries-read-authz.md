# Plan: Ringside Entry-Read Authorization

> **Status:** Active

**Created:** 2026-06-24. Closes the open RLS/data-path question flagged by the 2026-06-17
show-day walk (S2.2/S3) in [`docs/audits/2026-06-ux-journeys/05-showday-walk-2026-06-17.md`](audits/2026-06-ux-journeys/05-showday-walk-2026-06-17.md):
**a judge or passcode/steward session is admitted to `/at-show/:showId` but reads zero entries**, so
the entry list, run order, and scoresheet are empty for every non-managing ringside role.

This blocks: the judge/steward golden path (scorecard row stays Yellow), the J-02…J-06 documentation
shots (Ringside Quickstart 4b), and any real ringside scoring by a non-secretary.

---

## Root cause (code-confirmed 2026-06-24)

1. **`entries_select` (migration `129_fix_entries_rls_and_armband_ordering.sql`) is `TO authenticated`
   and admits only:** `can_manage_show(show_id)` OR handler-of-entry OR owner-of-dog. A `judge` /
   `steward` role is **not** `can_manage_show` (that excludes those roles), so an assigned judge reads
   0 rows. An anon passcode holder has no `auth.uid()` at all and is not `authenticated`, so reads 0 rows.
2. **The at-show entry list reads through the replication layer** (`replicatedEntriesTable` →
   PostgREST `select` on `entries`), under the caller's own RLS context. No special ringside read path
   exists. So the empty result is RLS, not a client bug.
3. **Payment/PII protection on `entries` is WRITE-only** (`trg_entries_protect_payment_fields`,
   `20260611240000`). There is **no column-level READ restriction**. Any row `entries_select` admits
   exposes `entry_fee`, `payment_method`, `payment_status`, `stripe_payment_intent_id`,
   `refund_amount`, and handler PII.

**Consequence:** simply adding a judge/passcode branch to `entries_select` would make ringside work
**but re-introduce the withheld-column leak that PR #779 closed for anon** (see
[[project_public_results_release_gate]]). The fix must follow #779's shape: a **column-allowlisted
ringside read path**, not a broadened table policy.

## Two identity models (the fork)

| Identity | Has `auth.uid()`? | Authorization signal | Difficulty |
|---|---|---|---|
| **Signed-in assigned judge/steward** (account + `judge`/`steward` RBAC role) | Yes | `judge_assignments` row for the show (seeded in `seed-demo.sql` §11) | Tractable |
| **Passcode holder** (steward/guest judge, no account) | **No** (anon key) | Valid `show_passcodes` row → `ringside_session`; no RLS-visible binding to a show | Hard |

The passcode flow validates server-side (`validate_passcode`, service-role-only behind the rate-limited
`validate-passcode` edge fn) and drives **client-side** role via `useRingsideGrantRole` /
`resolveRingsideAccess`. The DB has **no** per-request proof that an anon caller holds a passcode for a
given show — so an anon RLS policy on `entries` cannot be written safely without a session-bound token.

---

## Design decision (proposed — confirm before building)

**A dedicated ringside read path with a column allowlist, mirroring `publicReads.ts` / the #779
cascade.** Not a broadened `entries_select`.

Column allowlist for ringside (the steward/judge legitimately need these; everything else is withheld):
`id, show_id, trial_id, class_id, dog_id, handler_id, armband_number, run_order, entry_status,
check_in_status, score fields (result, time, faults, placement), dog call name + breed, handler name`.
**Excluded:** `entry_fee, payment_method, payment_status, stripe_payment_intent_id, refund_amount,
confirmation_email_*`, and any other payment/PII-beyond-name column.

Two candidate mechanisms (decide in Task 1):
- **(a) `SECURITY DEFINER` RPC** `get_ringside_entries(p_show_id, p_class_id)` returning the allowlist,
  authorizing internally (authenticated: `judge_assignments`/`can_manage_show`; passcode: a
  session-token argument validated against `ringside_sessions`). Mirrors `validate_passcode`'s
  service-definer discipline. Offline: not replication-cached — see Offline note.
- **(b) A view + grant** (`view_ringside_entries`) with RLS/`security_invoker` — simpler but cannot
  authorize an anon passcode caller without the same token problem, so likely RPC for anon regardless.

**Recommendation:** RPC for the anon/passcode path; for the authenticated path, prefer extending the
existing replication read with a column-restricted view so offline-first still holds for signed-in
judges (the role most likely to score for real). Resolve in Task 1.

### Offline note (do not skip — [[feedback_offline_first]])

Ringside scoring is offline-first. A signed-in judge's entry reads should stay on the replication
layer so they survive signal loss; that argues for the **authenticated** path being a column-restricted
view the replication mapper can target, not an RPC. The **passcode/anon** path is harder to make
offline-safe and may ship online-only first (documented limitation), since anon ringside is the
lower-frequency case. Confirm the offline bar per identity in Task 1.

---

## Phasing

### Phase 1 — Signed-in assigned judge/steward (read)  *(highest value, lowest risk)*
- Define the ringside column allowlist as a DB view (`view_ringside_entries`) or restricted select.
- Authorize: `can_manage_show(show_id)` OR `EXISTS judge_assignments ja (ja.show_id = e.show_id AND
  ja.person_id = person_for(auth.uid()))`. (Steward: confirm whether stewards get `judge_assignments`
  rows or a separate signal; if not, Phase 1 covers judge accounts only and steward rides Phase 2.)
- Route the at-show entry list / scoresheet reads for non-`can_manage_show` authenticated roles to the
  restricted path; keep `can_manage_show` on the existing full path.
- **Verifies:** `judge@` / `e2e-judge@` (with §11 assignment) sees the run order + scoresheet with data.

### Phase 2 — Passcode/anon ringside (read)
- Mint a session-bound proof at passcode validation (extend `validate-passcode` to return a signed
  `ringside_session` token, or use Supabase anonymous auth with a show/role claim) so the DB can
  authorize an otherwise-anon caller.
- `get_ringside_entries` RPC validates the token → returns the allowlist for that show only.
- Decide offline posture (likely online-only first; document it).

### Phase 3 — Write authz (separate, tracked elsewhere)
- Ringside score WRITES for judge/steward are the [[project_atshow_judge_write_rls_gap]] gap
  (`entries_update` is `can_manage_show`-only → writes silently RLS-fail on sync). Out of scope for
  this read-focused plan; cross-link and sequence after Phase 1/2 reads land.

---

## Testing phase (required)

- **RLS unit tests** (pgTAP or the repo's RLS test harness): as `judge@`/`e2e-judge@` with a §11
  assignment, the ringside read returns the seeded Heartland entries; **without** an assignment it
  returns 0; payment/PII columns are **absent** from the allowlist result.
- **Column-set regression test** pinning the exact allowlist (extract the select to a const + a
  column-set test, per [[feedback_replication_fallback_dual_path]]) so a future column add can't
  silently leak payment/PII.
- **Negative test:** a passcode/anon caller without a valid token reads 0 (Phase 2).
- **Client routing test:** non-`can_manage_show` role uses the restricted read path; `can_manage_show`
  uses the full path. Don't regress the secretary ringside view.
- **Verify in a cold anon session** for the passcode path ([[feedback_verify_anon_in_cold_session]]).

## Review gate

RLS + read-authz diff → run `/review` **and** `/codex:review` (CLAUDE.md high-stakes rule). Do not push
to staging without confirmation (Auto Mode shared-system rule).

## Cross-references

- Open question source: show-day walk S2.2/S3 (doc `05`).
- Precedent to mirror: PR #779 per-field visibility cascade + `publicReads.ts` ([[project_public_results_release_gate]]).
- Write-side sibling gap: [[project_atshow_judge_write_rls_gap]].
- Fixtures already authored: `seed-demo.sql` §11 (judge_assignments), §12 (passcodes `jh3k9`/`s7m2p`) —
  applying them to staging is a prerequisite to *verifying* this, but does not by itself fix the RLS.
- Unblocks: Ringside Quickstart 4b (J-02…J-06) once a judge identity can render entries.
