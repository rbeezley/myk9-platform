## 1. R3 — Throttle schema backfill (do first; unblocks trust in J1.1)

- [x] 1.1 Query live DB for `check_login_rate_limit`, `record_login_attempt`, and the backing attempts table; capture definitions. — DONE: neither function existed on the live DB (nor in any migration); edge fn fails open, so throttle was a silent no-op since launch.
- [x] 1.2 Write idempotent backfill migration (numbered, with explicit GRANTs — expected edge-fn/service-role only, no anon/authenticated exposure); run migration-auditor. — migration 20260710140000; service_role-only grants + RLS-enabled defensively; migration-auditor SAFE TO PUSH; pushed to staging.
- [x] 1.3 Contract test asserting the migration defines both functions; `supabase migration list` reconciled. — functions live-verified present; migration applied.

## 2. R2 — Passcode regeneration revokes stamped claims (J1.3)

- [x] 2.1 Live regeneration walk on staging to document current behavior (confirm stale claim keeps working). — DONE via live DB inspection: `regenerate_show_passcodes` bumps `show_passcodes.created_at` in place (stable row id); RPCs authorized on claim with no cross-check, so a stale claim kept working.
- [x] 2.2 Implement generation-counter revocation (claim stamps `passcode_generation`; `ringside_update_entry` + `upsert_ringside_session` reject stale generations with 42501). — migration 20260710150000 (opus batch); passcode-claim arm only; account tiers untouched (byte-for-byte drift check clean); also revoked stale anon EXECUTE on `ringside_update_entry`. Edge fn deployed before migration push (ordering dependency). Live-verified.
- [x] 2.3 Assertion-first tests: RPC rejects stale generation; fresh claim passes; client surfaces "access revoked — re-enter code". — contract test pins the guard + 42501 message; client helper discriminates the specific message from generic 42501; comparison semantics live-verified (fresh allowed, stale/null rejected fail-closed).

## 3. R1 — Ringside escalation surface (J5.4)

- [x] 3.1 Verify/extend anon-claim READ access to show-scoped announcements (pattern of migration 20260624163000; never widen `can_view_admin`). — No migration needed: `show_announcements` SELECT policy (`auth.uid() is not null`, mig 057) already admits the anon passcode session (runs as `authenticated`); live-verified + pinned by a static-SQL contract test.
- [x] 3.2 Mount announcement feed inside the `AtShowAccessGate` stack (reuse existing components; replication/realtime path; no composer). — `AtShowAnnouncementFeed` reuses `announcementStore` + `AnnouncementItem`, scoped via `subscribe([showId])` (realtime `show_id=eq` filter); read-only, no composer.
- [x] 3.3 Tests: feed renders for passcode session; RLS read-contract test. — both present; 16 tests green.

## 4. R4 — Hides/distractions ringside display (J2.3)

- [x] 4.1 Plumb `hides_known`/`distraction_count` through `buildClassInfo` → `ClassInfo` → class details popover. — mapped from `ReplicatedClass` (replication path intact); rendered class-aggregate rows next to time limits.
- [x] 4.2 Adapter unit tests for the new fields; visual check on ringside class details. — falsy-safe (`typeof` guards so 0/false render); tests cover false/0/omitted cases.

## 5. Spec amendment + verification

- [x] 5.1 Apply the MODIFIED scope requirement to the main `judge-responsibility-verification` spec (via this change's delta). — un-defer scenarios + "Confirmed sweep gaps are remediated with tests" requirement synced into `openspec/specs/judge-responsibility-verification/spec.md`.
- [x] 5.2 Update matrix rows J1.1/J1.3/J2.3/J5.4 statuses as each R-item lands; `pnpm typecheck`, lint, full test suite green. — matrix rows updated; typecheck 26/26; 35 batch tests green.
- [ ] 5.3 Verify implementation against artifacts (`opsx:verify`), PR, review, merge, archive. — in progress.
