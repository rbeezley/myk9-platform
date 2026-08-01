# Security Findings Remediation Plan — 2026-08-01

> **Status:** Active

## Goal

Work the active security backlog in exploitability order while preserving the finding lifecycle
contract: code changes, regression tests, applied/exploit-path proof, and Linear closure are separate
gates. No finding is marked resolved from a merge alone.

## Scope

Active findings from the 2026-07-31 audit and their current Linear records:

| Order | Issue                                                       | Finding                                                               | Severity  | Work shape                                                               |
| ----: | ----------------------------------------------------------- | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
|     1 | [MYK9-145](https://linear.app/myk9-platform/issue/MYK9-145) | SA-2026-07-31-01 expired/revoked Edge role authorization and fanout   | HIGH/P0   | code + unit/handler matrix + disposable replay                           |
|     2 | [MYK9-127](https://linear.app/myk9-platform/issue/MYK9-127) | SA-2026-07-29-01 protected hide-count residue in shared offline cache | HIGH/P0   | design decision + replication/cache code + offline role-transition proof |
|     3 | [MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125) | SA-2026-07-29-11 premium authorization closure proof                  | HIGH/P1   | verification/evidence slice; code only if proof exposes a defect         |
|     4 | [MYK9-147](https://linear.app/myk9-platform/issue/MYK9-147) | SA-2026-07-29-06 steward office-administration writes                 | MEDIUM/P2 | role-policy design + SQL/browser matrix                                  |
|     5 | [MYK9-148](https://linear.app/myk9-platform/issue/MYK9-148) | SA-2026-07-29-12 AskQ anonymous identities and racy quota             | MEDIUM/P2 | edge authorization + atomic reservation design/tests                     |
|     6 | [MYK9-146](https://linear.app/myk9-platform/issue/MYK9-146) | SA-2026-07-29-03 public judge fees/notes                              | MEDIUM/P2 | column grant/policy migration + REST/public-panel proof                  |
|     7 | [MYK9-149](https://linear.app/myk9-platform/issue/MYK9-149) | SA-2026-07-29-08 public soft-deleted entries                          | LOW/P3    | policy migration + public-path proof                                     |
|     8 | [MYK9-132](https://linear.app/myk9-platform/issue/MYK9-132) | SA-2026-07-30-02 ACL monitor scheduled snapshot                       | LOW/P2    | evidence-only closure gate                                               |
|     9 | [MYK9-150](https://linear.app/myk9-platform/issue/MYK9-150) | SA-2026-07-29-05 preview CORS origin policy                           | INFO/P3   | explicit policy decision or hardening + contract tests                   |
|    10 | [MYK9-151](https://linear.app/myk9-platform/issue/MYK9-151) | SA-027 SECURITY DEFINER search_path dependency                        | INFO/P3   | explicit accepted-risk decision or qualified-path migration              |

Resolved, duplicate, and rejected findings are not reopened: SA-2026-07-29-02, SA-2026-07-29-13,
SA-2026-07-30-01, MYK9-116, and MYK9-128 remain historical coverage references.

## Execution phases

## Current progress — 2026-08-01

- **MYK9-145:** implementation slice complete locally in commits `690f38f37` and
  `9299997a7`. The shared active/unexpired role contract now covers privileged Edge checks,
  role-derived fanout, AskQ relationship checks, and email/results authorization. The full
  `supabase/functions` Vitest suite passes (88 files / 875 tests); the monorepo typecheck passes
  (26/26 tasks). The issue remains **In Progress** because disposable deployed expiry/revocation
  replay and the required per-handler side-effect matrix are still outstanding.
- **MYK9-127:** implementation is intentionally paused at the cache-isolation decision gate. The
  existing merged wire/ACL fix does not prove that protected hide counts cannot persist in the
  shared IndexedDB after sign-out, role change, expiry, or passcode leave. A purge/namespace choice
  must preserve authorized offline scoring before code changes continue.
- **MYK9-125:** existing authorization code is present, but closure remains blocked on the
  authorized paid-path smoke, account-wide quota proof, and role matrix. No paid invocation was
  attempted.
- **MYK9-147:** local implementation committed in `308c91a0d`. The new office-manager predicate
  accepts only current site-admin, club-admin, or show/club secretary roles; judge-assignment and
  enrollment write policies no longer use the steward-inclusive `is_show_official()` predicate.
  Source and behavioral-test registration contracts pass, and monorepo typecheck passes. Applied
  SQL/PostgREST replay is still required before resolution; the Linear state update could not be
  sent because the Linear transport returned an HTTP error.
- **MYK9-148:** local implementation committed in `8cb10cf5a`. Anonymous AskQ identities are
  rejected before quota/model work, and a caller-scoped `reserve_askq_query(text)` RPC now locks
  the account/day budget, inserts the audit row, and returns the authoritative limit/remaining
  values. The migration preserves the existing `people.subscription_tier` premium semantics and
  UTC reset boundary. AskQ function tests pass (90 files / 886 tests), the monorepo typecheck
  passes (26/26 tasks), and the source/behavioral SQL contracts are registered. Closure remains
  blocked on applied SQL, premium/reset checks, model non-invocation evidence, and a disposable
  parallel burst proving the exact concurrent quota; no Linear state mutation was performed.
- **MYK9-146:** local implementation is complete in the current remediation worktree. Migration
  `20260801140000_withhold_judge_assignment_private_columns.sql` removes table-wide anon and
  authenticated SELECT, restores only safe assignment columns, and exposes protected fee/notes
  through the show-scoped `get_manager_judge_assignments()` RPC. Public show/timeline queries and
  replication now request only the safe shape; stale offline collection reads redact fee/notes,
  and judge personal stats show fees as withheld. Source, replication, show-mapper, judge-query,
  and behavioral-runner contracts pass (84 focused app tests plus 8 runner tests); app typecheck
  passes. Closure remains blocked on applied `relacl`/`attacl`, cold-anon and ordinary REST
  42501 probes, manager-positive RPC/REST evidence, public-panel runtime replay, and disposable
  deployed proof. Independent ACL and app reviews found no code blocker.
- **MYK9-149:** local implementation is complete in the current remediation worktree. Migration
  `20260801150000_exclude_soft_deleted_entries_from_anon_tv.sql` adds the missing
  `entries.deleted_at IS NULL` predicate to the anonymous TV/running-order policy while retaining
  the public-show scope. Added a source contract and registered behavioral SQL fixture proving a
  live entry remains visible while a soft-deleted sibling is hidden; TV query tests, behavioral
  runner registration, app typecheck, and `git diff --check` pass. Closure remains blocked on
  applied cold-anon REST, public TV/runtime, public-view, and replication-backed proof.
- **MYK9-132:** closure evidence is now present. The latest applied scheduled snapshot at
  `2026-08-01T07:00:05.276371Z` reports `anon_grants: ok` — 20 table grants (1 write) and 75
  column grants, all on the allowlist. The snapshot's unrelated `payout_cron: warn` remains a
  separate operational finding. Keep the Linear issue open until its external status is updated
  under the shared-system approval gate.

### Phase 0 — Baseline and proof harness

- Confirm the worktree is on the remediation branch and the baseline is current `main`.
- Read each issue's current Linear description and the audit evidence before editing.
- Inventory existing role-validity helpers, Edge auth tests, migrations, replication lifecycle, and
  behavioral SQL test registration.
- Record the exact proof required for each issue before changing status.

### Phase 1 — P0/P1 authorization and integrity

1. **MYK9-145:** centralize the active/unexpired role predicate for privileged Edge caller checks
   and role-derived recipient fanouts. Cover recovery-link, deletion, invitation, registration,
   lifecycle, targeted-message, chat, and support paths. Add fail-closed query-error behavior and
   tests for expired, boundary, inactive, null-expiry, future-expiry, and current roles.
2. **MYK9-127:** decide the cache isolation contract before implementation. Candidate designs must
   preserve authorized judge/steward offline scoring while ensuring a later exhibitor or passcode
   session cannot inspect protected fields. Implement the selected purge/namespace strategy and
   prove role leave, revocation, expiry, anonymous leave, and sign-out behavior in a shared-browser
   offline test.
3. **MYK9-125:** run the existing authorization/unit suite, then complete the authorized paid-path
   replay and account-wide quota decision. Keep the issue blocked until every acceptance criterion
   has passing evidence.

### Phase 2 — P2 authorization and data exposure

4. **MYK9-147:** define separate office-management and show-day predicates. Add SQL/browser tests
   proving steward-only denial and secretary/club-admin/site-admin positives without breaking
   ringside workflows.
5. **MYK9-148:** reject anonymous identities before model work and replace count-then-insert with
   an atomic reservation. Add parallel quota tests and assert no model call on denied/reservation-
   failure paths.
6. **MYK9-146:** add a least-privilege public column allowlist for judge assignments. Verify applied
   ACLs, anonymous protected-column denial, authorized manager access, and public judge-panel output.

### Phase 3 — Mechanical low-risk fixes and operational evidence

7. **MYK9-149:** add the entry soft-delete predicate to public access and verify REST, TV, public
   views, and replication behavior.
8. **MYK9-132:** observe the next real scheduled health snapshot after the checker fix. The
   2026-08-01 07:00 UTC snapshot is now the required applied proof; do not substitute fixture or
   source tests for this evidence.

### Phase 4 — INFO hardening decisions

9. **MYK9-150:** choose exact-origin enforcement or explicit accepted-risk documentation; add
   contract tests for allowed origins and malicious lookalikes if changing code.
10. **MYK9-151:** inventory surviving SECURITY DEFINER functions and choose qualified empty-path
    conversion or an owned accepted-risk/ACL-monitoring contract.

### Phase 4 decision review — 2026-08-01

- **MYK9-150 / SA-2026-07-29-05:** the current CORS helper allows dynamically named Vercel
  previews only when the canonical preview base origin is present in the list. The regex is
  anchored to `https://...vercel.app`, does not match lookalike suffixes, and no reviewed function
  enables credentialed cookies; bearer authorization remains the real gate. Recommendation:
  retain the preview workflow and document accepted INFO risk, adding malicious-lookalike contract
  tests if the owner wants a durable guard. Switching to exact origins requires deployment-origin
  inventory and coordination, so it is not an autonomous remediation.
- **MYK9-151 / SA-027:** the 21 surviving `SECURITY DEFINER` functions use `search_path=public`,
  but the applied evidence cited by the audit shows client roles lack `CREATE` on `public`, so no
  current shadow-object attack path exists. A blanket empty-path migration would require reading
  every body and qualifying any unqualified reference. Recommendation: retain accepted-risk
  status with schema-ACL monitoring, and convert each function when it is next edited; do not
  bulk-rewrite without an owner-approved hardening batch.

## Testing and closure gates

- Write assertion-first regression tests for each value-sensitive authorization or ACL change.
- Run the narrowest unit/SQL test after each slice, then relevant typecheck/lint.
- Register every launch-critical SQL test in both the runner file and its registration assertion.
- Run the full relevant suite once all code slices are complete; stop a hanging runner after 60
  seconds and record the block.
- Use applied-database or disposable staging proof for RLS, Edge, payment, offline, and scheduled
  checks. A passing migration file or merged PR is not closure proof.
- Update Linear status only after its acceptance and evidence gate passes; keep blocked issues open.

## Decision gates

- **MYK9-127:** user/product decision required if cache isolation changes offline scoring semantics.
- **MYK9-147:** product role matrix required before removing steward office writes.
- **MYK9-148:** quota identity, reset, and account-budget semantics must be explicit.
- **MYK9-150 / MYK9-151:** accepted-risk owner or code-hardening choice required.

## Non-goals

- No unrelated feature work, UX redesign, new pages, or broad refactors.
- No production/staging database writes, Edge deploys, paid model invocations, issue closure, PR
  creation, or push without the applicable approval gate.
