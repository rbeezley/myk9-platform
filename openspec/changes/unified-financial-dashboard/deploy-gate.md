# Shared-system deploy gate (task 1.8)

The Phase 0/1 work adds DB migrations and edge-function changes that are NOT
deployed by merging. Per CLAUDE.md "Auto Mode — shared-system writes", each of
the following requires an explicit operator confirmation before running, even
once the PR merges:

## Migrations (require `supabase db push` — operator-gated)

- `supabase/migrations/20260717120000_stripe_order_snapshots.sql` — adds immutable
  snapshot columns to `stripe_orders` + tightened grants.
- `supabase/migrations/20260717130000_financial_reconciliation_rpc.sql` — adds the
  4 reconciliation functions + supporting indexes.

Order matters: push `20260717120000` before `20260717130000` (the RPC reads the
snapshot columns). Push before deploying the webhook (the webhook writes the new
columns). Run `supabase db push` from the worktree linked to project
`sojmvhhwsjxmfistvzbe`; confirm the "Deployed ... on project sojmvhhwsjxmfistvzbe"
line names the right ref.

## Edge function (requires `supabase functions deploy` — operator-gated)

- `stripe-webhook` — now fetches the charge balance transaction and writes
  snapshot fields. Deploy with `--project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`
  AFTER the `20260717120000` migration is live (writing a not-yet-existent column
  would fail every webhook).

## Local checks completed (task 1.8)

- Source-pin + behavior tests: `pnpm vitest run supabase/functions` (488 pass),
  `pnpm vitest run src/features/financial/` (32 pass).
- `pnpm typecheck` — 26/26 packages clean.
- `migration-auditor` run on both migrations: no FAIL findings.

No historical backfill runs as part of any deploy: pre-existing orders keep NULL
snapshot columns and are reported rate-unverifiable / net-pending.
