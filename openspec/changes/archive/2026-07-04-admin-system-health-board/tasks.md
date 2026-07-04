## 1. Database migration (store + RLS)

- [x] 1.1 Query the DB to re-confirm `is_site_admin()` exists and `public.system_health_snapshots` does not, before writing SQL.
- [x] 1.2 Create `supabase/migrations/<ts>_create_system_health_snapshots.sql`: table exactly per contract (`id` uuid PK default `gen_random_uuid()`, `created_at` timestamptz default `now()`, `source` text not null, `overall_status` text not null CHECK in `('ok','warn','fail')`, `checks` jsonb not null, `run_duration_ms` integer), plus `create index on (created_at desc)`. Add a comment noting the intended future convergence with `operator_alerts`.
- [x] 1.3 In the same migration: `enable`/`force row level security`; `grant select` to `authenticated`; `grant insert` to `service_role`; NO grant to `anon`; `create policy` for SELECT to `authenticated` `using (public.is_site_admin())`.
- [x] 1.4 Run the migration-auditor agent over the new migration (GRANTs present, RLS present, no O(N) policy, CHECK matches enum).
- [x] 1.5 Apply the migration to the linked project (pause for shared-DB confirmation per Auto Mode rule), then regenerate/verify TS types include the new table Row. — SQL verified against the live schema (`is_site_admin()` present, table absent) + migration-auditor SAFE TO PUSH; `Database` Row hand-added to `packages/supabase` and `pnpm typecheck` is green. Actual `supabase db push` is a deploy-time shared-DB write, deferred to the post-merge deploy step ("merge is not deploy").

## 2. Pure logic (extracted, testable)

- [x] 2.1 Create `apps/myk9show/src/features/admin-system-health/systemHealthTypes.ts` — `HealthCheck`, `SystemHealthSnapshot`, `HealthStatus = 'ok'|'warn'|'fail'` types.
- [x] 2.2 Create `apps/myk9show/src/features/admin-system-health/systemHealthSelectors.ts` — `parseSnapshot`, `deriveEffectiveStatus(snapshot|null, now)`, `isStale`, `STALE_AFTER_MS` (~26h), `statusToBadgeVariant`, `formatCheckedAgo`. Never throws on malformed `checks`.

## 3. Data hook

- [x] 3.1 Create `apps/myk9show/src/features/admin-system-health/useSystemHealthSnapshots.ts` — React Query hook: single query `select('*').order('created_at', desc).limit(7)` via `@/services/database/supabaseClient`; expose `latest = rows[0]`, `history = rows`, plus `isLoading`/`error`. Follow the `usePublishedExperienceContent` pattern.

## 4. Page + wiring (reuse only)

- [x] 4.1 Create `apps/myk9show/src/pages/admin/SystemHealthPage.tsx` — prominent overall status (`StatusBadge` from `@myk9/ui`), stale/empty warning banner, per-check rows (label, `StatusBadge` pill via `statusToBadgeVariant`, detail, relative "checked N min ago"), and a 7-run history strip of colored dots. Cover all four view states explicitly — loading, query-error (read failed → visible error, not a blank screen), empty (no run), and populated. No new primitives; file < 500 lines. [EXPANDED: added loading/error/empty state coverage]
- [x] 4.2 Register route `/admin/health` in `apps/myk9show/src/routes/adminRoutes.tsx` using `adminGuard(<SuspenseWrapper><PageTransition>…</PageTransition></SuspenseWrapper>)`, lazy-imported like peer admin pages.
- [x] 4.3 Add a "System Health" admin nav item in `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts` (icon e.g. `Activity`), site-admin gated with the peers.
- [x] 4.4 Add a row for `/admin/health` in `apps/myk9show/src/features/admin-help/data/pageDirectory.ts` so the Help directory stays complete.
- [x] 4.5 Update `docs/operations/go-live-runbook.md` Phase 5 to point at `/admin/health` as the at-a-glance surface for the automated parity checks (tracking-doc sync per config rule). [ADDED]

## 5. Tests

- [x] 5.1 `systemHealthSelectors.test.ts` — cover: fresh `ok` snapshot → `ok`/not stale; stale snapshot → `fail`+stale regardless of stored status; empty (null) → `fail`+empty; malformed check entry parses to safe fallback without throwing; `statusToBadgeVariant` mapping; `formatCheckedAgo` boundaries.
- [x] 5.2 `SystemHealthPage.test.tsx` using the custom render from `src/test/utils/testUtils.tsx` — renders per-check rows for a fresh snapshot; shows stale warning for an old snapshot; shows empty state when no snapshot; shows an error state when the query fails; renders the history strip.
- [x] 5.3 Run `pnpm typecheck` and `cd apps/myk9show && pnpm test` (targeted files) green. Clear incremental tsbuildinfo if a new DB-view/table Row type isn't picked up.

## 6. Ship gate (final)

- [ ] 6.1 `/simplify` then `/harden` the diff; keep every file < 500 lines.
- [ ] 6.2 Open PR (body cites `Tracked in openspec change: admin-system-health-board`), run CI, self-review via code-reviewer, and — because the diff touches a migration + RLS — run the Codex second-opinion pass before merge.
- [ ] 6.3 Squash-merge to `main` from the main repo directory after CI + reviews are green.
