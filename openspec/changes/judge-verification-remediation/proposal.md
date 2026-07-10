# Judge Verification Remediation

## Why

The Phase 1 code-inventory sweep of the judge responsibility matrix
(openspec change `judge-responsibility-verification`, 2026-07-10) confirmed
four remediable findings and one scope decision. The owner decided
2026-07-10 to un-defer the already-shipped judge dashboard, which also
requires amending the verification capability's scope rule. This change
remediates the confirmed code gaps, following the precedent of
`secretary-verification-remediation` after the secretary sweep.

## What Changes

- **R1 (J5.4, verified gap):** mount/link the existing announcement surface
  into the ringside `/at-show` context so a judge has an in-app escalation
  path to the secretary. Consolidation rule: reuse the existing announcement
  components; no new messaging UI.
- **R2 (J1.3, potential gap):** make secretary passcode regeneration
  actually revoke access — already-stamped ringside session claims must stop
  working (revocation check or claim expiry), verified by a regeneration
  walk.
- **R3 (J1.1, schema drift):** confirm `check_login_rate_limit` /
  `record_login_attempt` / their backing table exist on the live DB, and
  backfill a tracked migration so the passcode throttle is reproducible.
- **R4 (J2.3, display wiring):** surface `classes.hides_known` and
  `classes.distraction_count` (persisted since migration 033) in the
  ringside class details display; assess per-area granularity separately
  before any schema change.
- **Spec amendment (J6.4):** modify the judge-responsibility-verification
  scope rule — the shipped judge dashboard is un-deferred and owned; only
  notifications/history remain auto-Deferred.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `judge-responsibility-verification`: scope rule amended per the J6.4
  un-defer decision.

## Impact

- Ringside `/at-show` route tree (announcement mount), passcode
  regeneration/claim validation path, one backfill migration, ringside class
  details display.
- Offline-first and OCC semantics must be preserved on all touched ringside
  paths; RLS/grant review required for R2/R3 migrations.
