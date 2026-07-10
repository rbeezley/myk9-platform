## 1. R3 — Throttle schema backfill (do first; unblocks trust in J1.1)

- [ ] 1.1 Query live DB for `check_login_rate_limit`, `record_login_attempt`, and the backing attempts table; capture definitions.
- [ ] 1.2 Write idempotent backfill migration (numbered, with explicit GRANTs — expected edge-fn/service-role only, no anon/authenticated exposure); run migration-auditor.
- [ ] 1.3 Contract test asserting the migration defines both functions; `supabase migration list` reconciled.

## 2. R2 — Passcode regeneration revokes stamped claims (J1.3)

- [ ] 2.1 Live regeneration walk on staging to document current behavior (confirm stale claim keeps working).
- [ ] 2.2 Implement generation-counter revocation (claim stamps `passcode_generation`; `ringside_update_entry` + `upsert_ringside_session` reject stale generations with 42501).
- [ ] 2.3 Assertion-first tests: RPC rejects stale generation; fresh claim passes; client surfaces "access revoked — re-enter code".

## 3. R1 — Ringside escalation surface (J5.4)

- [ ] 3.1 Verify/extend anon-claim READ access to show-scoped announcements (pattern of migration 20260624163000; never widen `can_view_admin`).
- [ ] 3.2 Mount announcement feed inside the `AtShowAccessGate` stack (reuse existing components; replication/realtime path; no composer).
- [ ] 3.3 Tests: feed renders for passcode session; RLS read-contract test.

## 4. R4 — Hides/distractions ringside display (J2.3)

- [ ] 4.1 Plumb `hides_known`/`distraction_count` through `buildClassInfo` → `ClassInfo` → class details popover.
- [ ] 4.2 Adapter unit tests for the new fields; visual check on ringside class details.

## 5. Spec amendment + verification

- [ ] 5.1 Apply the MODIFIED scope requirement to the main `judge-responsibility-verification` spec (via this change's delta).
- [ ] 5.2 Update matrix rows J1.1/J1.3/J2.3/J5.4 statuses as each R-item lands; `pnpm typecheck`, lint, full test suite green.
- [ ] 5.3 Verify implementation against artifacts (`opsx:verify`), PR, review, merge, archive.
