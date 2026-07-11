# Tasks: ringside-occ-conflict-circuit-breaker

## 1. Server migration (Layer A)

- [x] 1.1 Write migration `NNN_ringside_occ_conflict_containment.sql`: `CREATE SEQUENCE public.ringside_conflict_seq` (no client grants); re-emit `ringside_update_entry` verbatim from `20260710160000` §3 with two additions — early version precheck (after the step-1 entry fetch, before caller/auth resolution: count + `RAISE 40001` with DETAIL) and `PERFORM nextval('public.ringside_conflict_seq')` before both conflict raises; keep the late 0-row conflict path unchanged; end with the standard REVOKE public/anon + GRANT authenticated block; comment documents the version-disclosure trade-off (D1).
- [x] 1.2 Extend `system_health_probe()` in the same migration (re-emit, per `20260704130000`) to include `ringside_conflict_counter` = the sequence's current value.
- [x] 1.3 Diff the re-emitted function against `20260710160000` §3 to prove the only deltas are the precheck + counter lines; run the `migration-auditor` agent on the migration.

## 2. Health check (Layer C)

- [x] 2.1 Add the `ringside_conflicts` check to `apps/myk9show/supabase/functions/_shared/systemHealthChecks.ts`: detail stores the raw counter; status from delta vs the previous snapshot's stored value (ok <1,000 / warn ≥1,000 / fail ≥10,000); missing baseline or counter regression → ok with note. Thread the previous snapshot's counter into the builder where `cron-health-check` already reads prior state (or fetch the latest snapshot row if it does not).
- [x] 2.2 Unit tests in `systemHealthChecks.test.ts`: ok/warn/fail threshold boundaries, first-run no-baseline → ok+note, counter regression → ok+note.

## 3. Client bounded retry + parking (Layer B)

- [x] 3.1 Locate the ringside OCC upload/retry path (post-#963 rebase logic in `@myk9/replication` / the scoring upload adapter) and add: per-sync-cycle cap of 5 conflict retries with exponential backoff + jitter (1s→30s), and a persisted `attemptsTotal` field on the queued IndexedDB mutation incremented on every conflict attempt.
- [x] 3.2 Park at `attemptsTotal >= 50`: mutation excluded from automatic replay, payload retained, parked state persisted on the record.
- [x] 3.3 Surface parked mutations in the ringside UI as needs-review with retry (reset replay eligibility) and confirm-gated discard actions.
- [x] 3.4 Unit tests: rebase-then-succeed leaves no visible state; 5-conflict cycle stops with backoff growth; `attemptsTotal` persists across simulated reload; parking at 50 excludes from replay and preserves payload; retry/discard actions behave per spec. Rebuild `@myk9/replication` (`pnpm --filter @myk9/replication build`) before app-level test runs if the package changes.

## 4. Verification and merge gate

- [x] 4.1 Run focused vitest suites for every touched area from `apps/myk9show` (and package suites for `@myk9/replication`); all green.
- [x] 4.2 Run `pnpm typecheck` and `pnpm lint`; fix fallout.
- [ ] 4.3 Open PR (`Tracked in openspec change: ringside-occ-conflict-circuit-breaker`), pass CI, standard review + Codex second opinion (security-critical RPC re-emit), merge.

## 5. Deploy and live verification (operator-gated)

- [ ] 5.1 `supabase db push --project-ref sojmvhhwsjxmfistvzbe` (confirm before pushing; verify "Deployed" output names the right ref) — this also restores the `authenticated` grant, unwinding the 2026-07-11 emergency REVOKE.
- [ ] 5.2 Redeploy `cron-health-check` with explicit `--project-ref sojmvhhwsjxmfistvzbe`.
- [ ] 5.3 Live psql proof (rolled-back txn where mutating): stale `expected_version` → `40001` + DETAIL with sequence advanced despite abort; authorized write succeeds; `authenticated` EXECUTE restored, `anon` revoked; next daily snapshot (or a manually invoked run) shows the `ringside_conflicts` check.

## 6. Tracking

- [x] 6.1 Log the 2026-07-11 incident (root cause, mitigations, fix) in `docs/qa/findings.md` — including the ops-side remediation completed 2026-07-11: the Codex nightly converted from persistent heartbeat to a standalone job (25-min work cutoff / 30-min mandatory shutdown killing browsers, runners, dev servers, and child processes; Playwright 1 worker, 0 retries; shared-Supabase and ringside writes prohibited; old persistent QA task archived).
- [ ] 6.2 Update `OPEN-TODOS.md` pointer for this change as status moves; archive the change after merge + deploy evidence (`opsx:archive`).
