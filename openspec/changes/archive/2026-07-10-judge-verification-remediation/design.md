# Design — Judge Verification Remediation

## R1 — Ringside escalation surface (J5.4)

The announcement store/components (`announcementStore.ts`,
`AnnouncementItem.tsx`) exist but nothing under `atShowRoutes.tsx` mounts
them. Design: mount a read-only announcement feed (plus any existing
acknowledge affordance) inside the `AtShowAccessGate` guard stack — likely a
slot on the class-list page or a header affordance — reading through the
replication layer / realtime path already used app-side. The anon passcode
session must be able to READ show-scoped announcements: verify RLS for the
anon claim before wiring; if reads are blocked, extend the claim-based read
policy in the same pattern as migration 20260624163000 (never widening
`can_view_admin`). No composer at ringside — escalation is judge-sees +
in-person/steward relay for fall; a judge→secretary composer would be new
surface area (out of scope).

## R2 — Claim revocation on regeneration (J1.3)

`regenerate_show_passcodes` invalidates unused codes only; stamped
`app_metadata` claims live until sign-out. Design options, decided in
implementation after the live regeneration walk:

1. Generation counter: stamp `passcode_generation` into the claim at
   validate time; `ringside_update_entry` (and `upsert_ringside_session`)
   compare against the show's current generation and raise 42501 on
   mismatch. Server-authoritative, no auth-admin calls. Preferred.
2. Claim expiry: short-TTL claims re-validated by heartbeat. More moving
   parts; weaker revocation guarantee.

Either way the client must surface "access revoked — re-enter code" rather
than a silent failure (assertion-first test on the error path).

## R3 — Throttle migration backfill (J1.1)

Query live DB for the function definitions and backing table
(`pg_get_functiondef`), diff against `docs/security-audit-2026-07/plan-passcode-throttle.md`,
and commit a `CREATE OR REPLACE`-style idempotent migration capturing them
(with GRANTs per the new-table grant rule if the table is exposed — expected
NOT exposed; service-role/edge-fn only).

## R4 — Hides/distractions display (J2.3)

Plumb `hides_known`/`distraction_count` from `ReplicatedClass` through
`buildClassInfo` into `ClassInfo` and render in the ringside class details
popover next to time limits/area count. Class-aggregate only; per-area
granularity is a schema question deferred to a registry-requirements check
(rulebook pass shares Phase 2 with J3.1) — do not add columns in this
change.

## Spec amendment (J6.4)

Modify the `judge-responsibility-verification` capability's scope
requirement: the shipped dashboard is owned; only notification/history rows
auto-classify as Deferred.

## Testing

Each R-item ships with tests: R1 render/RLS-read tests; R2 assertion-first
RPC authz tests (42501 on stale generation) + client error-surface test;
R3 migration audited by migration-auditor (no unit test — contract test
asserting function existence via static SQL grep is acceptable); R4
adapter unit tests for the new `ClassInfo` fields.
