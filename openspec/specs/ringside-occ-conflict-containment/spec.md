# ringside-occ-conflict-containment

## Purpose

Contain optimistic-concurrency (OCC) conflict storms on the `ringside_update_entry` RPC server-side, so a stale or hostile client that repeats a doomed version-conflicting write cannot exhaust database CPU. The guarantee lives in the database because the platform is a PWA — stale cached bundles without the client-side self-heal persist on real devices indefinitely, and the same storm recurred twice (2026-06-25, 2026-07-11) despite client fixes. Also makes conflict volume observable so an operator sees a storm before the hosting provider's CPU alert. The `ringside_conflict_counter` fact this capability emits feeds the `ringside_conflicts` check in [admin-system-health](../admin-system-health/spec.md); the client-side bounded-retry/parking side is in [offline-scoring-durability](../offline-scoring-durability/spec.md).

## Requirements

### Requirement: A stale-version conflict is rejected before authorization resolution and dynamic SQL

`ringside_update_entry` SHALL check `p_expected_version` against the entry's current `version` immediately after loading the entry row, and on mismatch SHALL raise the conflict (errcode `40001`, DETAIL = the authoritative current version as text) without resolving caller identity, authorization tiers, passcode claims, the column allow-list, or executing the dynamic UPDATE. The marginal server cost of a conflicting call SHALL be no more than the entry PK lookup plus the exception itself.

#### Scenario: Doomed retry is cheap

- **WHEN** an authenticated client calls `ringside_update_entry` with a non-null `p_expected_version` that does not match the entry's current `version`
- **THEN** the function raises errcode `40001` with the current version in DETAIL, and no `people`, `user_roles`, `judge_assignments`, or show-manager lookups and no dynamic UPDATE are executed for that call

#### Scenario: Self-heal contract preserved

- **WHEN** a post-#963 client receives the early conflict
- **THEN** the error shape (errcode `40001`, message naming the entry and expected version, DETAIL carrying the authoritative version) is identical to the pre-change late-conflict contract, so the client rebases exactly as before

#### Scenario: Null expected version bypasses the precheck

- **WHEN** a caller passes `p_expected_version = NULL` (opt-out of OCC)
- **THEN** the precheck does not raise and the call proceeds to authorization exactly as today

#### Scenario: Concurrent race still guarded

- **WHEN** the precheck passes but another transaction advances the version before this call's UPDATE commits
- **THEN** the guarded UPDATE (`AND version = $2`) matches zero rows and the existing late conflict path raises `40001` with the re-read authoritative version in DETAIL

### Requirement: Conflicts are counted in a rollback-proof counter

Every conflict raise in `ringside_update_entry` (early precheck and late race path alike) SHALL advance the `ringside_conflict_seq` sequence before raising, and the count SHALL survive the transaction abort caused by the raise. The sequence SHALL NOT be granted to `anon` or `authenticated`; it is written only inside the SECURITY DEFINER function and read only by `system_health_probe`.

#### Scenario: Aborted transaction still counts

- **WHEN** a call raises a version conflict (transaction aborts)
- **THEN** `ringside_conflict_seq`'s value is one higher than before the call

#### Scenario: Successful writes do not count

- **WHEN** a call succeeds or fails for a non-conflict reason (not found, unauthorized)
- **THEN** the sequence value is unchanged

### Requirement: The authenticated EXECUTE grant is restored with the protection

The migration delivering the early rejection SHALL end with `EXECUTE` on `ringside_update_entry(uuid, jsonb, integer)` granted to `authenticated` and revoked from `public` and `anon`, converging the live database out of the 2026-07-11 emergency revoke.

#### Scenario: Scoring restored for authenticated sessions

- **WHEN** the migration is applied to a database where `authenticated` EXECUTE was revoked out-of-band
- **THEN** an authorized authenticated (including passcode-claim anonymous-auth) session can execute the function again, and `anon`/`public` still cannot
