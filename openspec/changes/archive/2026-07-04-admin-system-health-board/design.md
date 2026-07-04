## Context

Launch readiness (fall 2026) currently leans on a human running the `docs/operations/go-live-runbook.md` Phase 5 parity checklist by hand every launch morning. We are automating the recurring, machine-checkable parts into a daily job (companion change) that writes a snapshot row to Postgres; this change builds the durable store and the single read surface an operator opens each morning.

Current state, verified against the codebase:

- `is_site_admin()` **exists** and is canonical — `LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''`, resolving `site_admin` via `public.user_roles → public.roles`. RLS policies elsewhere use it.
- `public.system_health_snapshots` does **not** exist yet (`to_regclass` → null).
- The three peer admin monitoring pages are all **client-side** telemetry, confirmed:
  - `/admin/alerts` → `AlertsPage.tsx` → `useAlerts` → `AlertingService` (in-memory `Map`s, `EventEmitter`), no Supabase.
  - `/admin/sync`, `/admin/performance` similarly read IndexedDB/localStorage/in-memory.
  None can host a server-authoritative, cross-device record — so this is a new concern, not a duplicated surface.
- Reuse targets already exist: shared `StatusBadge` from `@myk9/ui` (variants include `success`/`warning`/`error`), `RowActionMenu`, `ProtectedRoute` + `adminGuard`, the `unifiedSidebarConfig` admin group, the `@/services/database/supabaseClient` + React Query fetch pattern, and the `testUtils.tsx` custom render.

## Goals / Non-Goals

**Goals:**
- Durable, RLS-protected `system_health_snapshots` store shaped as the same family as the planned `operator_alerts` table so they can converge later.
- A site-admin `/admin/health` page that reads the latest snapshot, renders overall status + per-check pills + freshness, treats a stale/missing run as a failure, and shows a 7-run history strip.
- Pure, unit-tested functions for parsing and status/staleness derivation.

**Non-Goals:**
- The check-runner / CI job that *writes* snapshots (companion change).
- Merging with `operator_alerts` — stay consistent, do not converge now.
- Any offline-first / replication involvement — this is admin monitoring of server-authoritative data, deliberately a direct Supabase read.
- New UI primitives.

## Decisions

### 1. One migration: table + index + GRANTs + RLS, referencing canonical `is_site_admin()`

Create `public.system_health_snapshots` exactly per the contract, plus `create index ... on (created_at desc)`. Access control:

```sql
alter table public.system_health_snapshots enable row level security;
alter table public.system_health_snapshots force row level security;  -- match the 2026-07 force-RLS sweep
grant select on public.system_health_snapshots to authenticated;
grant insert on public.system_health_snapshots to service_role;
-- no grant to anon
create policy "site_admin_can_read_health_snapshots"
  on public.system_health_snapshots for select to authenticated
  using (public.is_site_admin());
```

Rationale: matches CLAUDE.md's "every CREATE TABLE needs explicit GRANTs AND RLS." `service_role` writes via grant (and bypasses RLS in Supabase), so no INSERT policy is needed; `authenticated` reads are gated by `is_site_admin()`; `anon` gets nothing. `force row level security` mirrors the repo's recent hardening so a future table-owner query can't accidentally leak. **Alternative considered:** a `for all` policy — rejected; we grant the narrowest surface (SELECT-only to authenticated) and let the service-role grant handle writes.

### 2. Extract all logic into pure functions in a `selectors` module

New `apps/myk9show/src/features/admin-system-health/systemHealthSelectors.ts` (kept < 500 lines) exporting:
- `parseSnapshot(row)` → typed `SystemHealthSnapshot` with a normalized `checks: HealthCheck[]`, tolerant of missing/malformed check entries (unknown `status` → safe fallback, never throws).
- `deriveEffectiveStatus(snapshot | null, now)` → `{ status: 'ok'|'warn'|'fail', isStale, isEmpty }`; `fail` when empty or stale, else the snapshot's `overall_status`.
- `isStale(createdAt, now)` → boolean against a `STALE_AFTER_MS` constant (~26h).
- `statusToBadgeVariant(status)` → `'success'|'warning'|'error'` mapping for `StatusBadge`.
- `formatCheckedAgo(checkedAt, now)` → relative "N min ago" string.

Rationale: value-sensitive logic (the stale/empty → fail rule, the enum→variant mapping) is exactly what CLAUDE.md's assertion-first testing targets. Pure functions make the stale and empty cases trivially unit-testable without rendering. **Alternative considered:** inline in the component — rejected; untestable and would push the file over 500 lines.

### 3. One React Query hook, one query, serving both latest + history

`useSystemHealthSnapshots()` runs `supabase.from('system_health_snapshots').select('*').order('created_at', { ascending: false }).limit(7)`. The latest snapshot is `rows[0]`; the history strip is `rows`. Follows the established fetch-fn + `useQuery({ queryKey, queryFn, staleTime })` pattern from `usePublishedExperienceContent`. Rationale: one round-trip covers both needs; `limit(7)` is cheap and the `created_at desc` index serves it directly.

### 4. Page composes existing primitives only

`SystemHealthPage.tsx` under `pages/admin/`:
- Overall status shown prominently (large `StatusBadge` from the derived effective status).
- Stale/empty banner when `isStale`/`isEmpty` — an explicit warning that a run is overdue.
- Per-check rows: label, `StatusBadge` pill (`statusToBadgeVariant`), detail text, relative "checked N min ago".
- 7-run history strip: small colored dots keyed to each run's `overall_status`, using existing `bg-success`/`bg-warning`/`bg-error` design tokens (spans, not a new primitive; `StatusDot` is class-status-domain coupled so not reused directly).
- `RowActionMenu` reused if any per-check action is warranted (e.g. copy detail); otherwise omitted to avoid gratuitous surface.

Registered in `routes/adminRoutes.tsx` via `adminGuard(<SuspenseWrapper><PageTransition><SystemHealthPage/></PageTransition></SuspenseWrapper>)` (lazy-imported like peers), a nav item in `components/layout/sidebar/unifiedSidebarConfig.ts` admin group (`{ title: 'System Health', href: '/admin/health', icon: Activity, description: '...' }`), and a row in `features/admin-help/data/pageDirectory.ts` so the Help directory stays complete.

## Risks / Trade-offs

- **RLS leak via wrong role** → Mitigated by SELECT-only grant to `authenticated` behind `is_site_admin()`, no `anon` grant, `force row level security`, and a Codex second-opinion pass (CLAUDE.md high-stakes rule). Verify with a migration-auditor pass before push.
- **Empty table / no run yet crashes or shows blank** → `deriveEffectiveStatus(null)` returns `fail`+`isEmpty`; page renders an explicit empty state. Unit-tested.
- **Malformed `checks` JSONB from the companion writer** → `parseSnapshot` normalizes and never throws; unknown status falls back rather than crashing the page. Unit-tested.
- **Stale run silently shown as healthy** → the ~26h staleness rule forces `fail` regardless of stored `overall_status`; surfaced as its own banner. This is the core "a missing run is itself a failure signal" requirement.
- **Divergence from `operator_alerts`** → columns intentionally mirror the planned shape; a comment in the migration notes the future convergence without coupling now.
- **Offline-first**: none — admin-only server read, out of the replication path by design.

## Emotional intent (docs/INTENT.md)

This page serves the **Site Admin — _"The platform is healthy"_** role (INTENT.md §2). The target feelings map directly onto the design and must be preserved:
- _"Everything looks normal"_ / "problems surfaced automatically" → the prominent overall status pill and the loud stale/empty/fail banners exist precisely so the operator sees trouble without hunting. Do not soften a `fail`/stale state into a neutral or easily-missed indicator.
- _"I can drill down"_ → per-check rows carry the detail text and freshness so the summary leads to specifics; the 7-run strip gives the recent trend at a glance. No `// INTENT:` comments are being modified; a new one may be added on the status-derivation function to protect the "stale = fail, surfaced loudly" rule.
