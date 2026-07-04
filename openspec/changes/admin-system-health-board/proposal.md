## Why

Go-live readiness currently depends on an operator manually walking the launch-morning parity checklist in `docs/operations/go-live-runbook.md` (Phase 5). For fall 2026 launch we want the recurring, machine-checkable parts of that checklist to run automatically and land in the database, so the operator opens **one page each morning** and sees green/amber/red at a glance instead of re-running a manual list. This change builds the durable store and the read surface; a companion change adds the check-runner that writes to it.

A missing or stale run is itself a launch-readiness signal — if no check has landed in ~26h, the operator must be told loudly, because silence can hide a broken cron.

## What Changes

- **New table `public.system_health_snapshots`** — a durable, append-only store of daily server-side health-check runs (`source`, `overall_status`, a `checks` JSONB array, `run_duration_ms`), with an index on `created_at desc`. Explicit GRANTs + RLS: `authenticated` may `SELECT` only via `is_site_admin()`; `service_role` may `INSERT`; no `anon`. Shaped as the same family as the planned `operator_alerts` table (`docs/plan-money-path-hardening.md` MP-08) so they can converge later — but NOT merged now.
- **New route `/admin/health`** rendering the latest snapshot: overall status shown prominently, one row per check (label, green/amber/red status pill, detail, relative "checked N min ago").
- **Stale-run guard** — if the latest snapshot is older than ~26h (or the table is empty), the page surfaces that as its own warning, treating a missing run as a failure signal rather than showing stale data as if fresh.
- **A small 7-run history strip** so the operator can see whether the last week trended healthy.
- **Admin nav entry** ("System Health") registered alongside Sync/Performance/Alerts, site-admin gated exactly like its peers.

## Capabilities

### New Capabilities
- `admin-system-health`: A site-admin-only board that reads persisted server-side health-check snapshots from Supabase and renders overall status, per-check status pills with freshness, staleness/empty warnings, and a short run-history strip — backed by an RLS-protected `system_health_snapshots` store.

### Modified Capabilities
<!-- None. No existing spec's requirements change. The existing /admin/sync, /admin/performance, and /admin/alerts pages are client-side telemetry (IndexedDB/localStorage/in-memory) and are untouched. -->

## Impact

- **Duplication check (required by config):** Does this duplicate an existing surface? **No.** `/admin/sync`, `/admin/performance`, and `/admin/alerts` are all *client-side* telemetry — they read IndexedDB / localStorage / in-memory state on the current device and cannot host *server-side* check results shared across operators. A cross-device, server-authoritative health record is a genuinely new concern, so a link to an existing page cannot satisfy it. The new page is added as a peer, reusing the same shell, gating, and status-token primitives — no new UI primitives.
- **Database:** one new migration in `supabase/migrations/` (table + index + GRANTs + RLS policy referencing canonical `public.is_site_admin()`, confirmed to exist).
- **Frontend (`apps/myk9show`):** new page component + a React Query hook reading the latest + last-7 snapshots via the Supabase client; new route registration and admin-nav entry. Reuses existing status-token and RowActionMenu patterns.
- **Offline-first:** none. This is an admin monitoring read of server-authoritative data, not show-day persistent app data, so it deliberately reads Supabase directly and does not go through `@myk9/replication`.
- **Out of scope:** the check-runner / CI job that writes snapshots (companion change), and any merge with `operator_alerts`.
