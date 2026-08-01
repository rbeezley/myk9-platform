# Security Findings Remediation Plan — 2026-08-01

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
8. **MYK9-132:** observe the next real scheduled health snapshot after the checker fix. Do not close
   from fixture or source tests alone.

### Phase 4 — INFO hardening decisions

9. **MYK9-150:** choose exact-origin enforcement or explicit accepted-risk documentation; add
   contract tests for allowed origins and malicious lookalikes if changing code.
10. **MYK9-151:** inventory surviving SECURITY DEFINER functions and choose qualified empty-path
    conversion or an owned accepted-risk/ACL-monitoring contract.

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
