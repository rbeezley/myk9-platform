# Shared-system deploy gate (task 1.8)

The Phase 0/1 work adds DB migrations and edge-function changes that are NOT
deployed by merging. Per CLAUDE.md "Auto Mode — shared-system writes", each of
the following requires an explicit operator confirmation before running, even
once the PR merges:

## Migrations (require `supabase db push` — operator-gated)

- `supabase/migrations/20260717122000_stripe_order_snapshots.sql` — adds immutable
  snapshot columns to `stripe_orders` + tightened grants.
- `supabase/migrations/20260717130000_financial_reconciliation_rpc.sql` — adds the
  4 reconciliation functions + supporting indexes.

Order matters: push `20260717122000` before `20260717130000` (the RPC reads the
snapshot columns). Push before deploying the webhook (the webhook writes the new
columns). Run `supabase db push` from the worktree linked to project
`sojmvhhwsjxmfistvzbe`; confirm the "Deployed ... on project sojmvhhwsjxmfistvzbe"
line names the right ref.

## Edge function (requires `supabase functions deploy` — operator-gated)

- `stripe-webhook` — now fetches the charge balance transaction and writes
  snapshot fields. Deploy with `--project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`
  AFTER the `20260717122000` migration is live (writing a not-yet-existent column
  would fail every webhook).

## Stripe event destination (shared-system setting — operator-gated)

- Confirm the platform webhook destination delivers `refund.updated` in addition to
  the existing `refund.failed` and `charge.refunded` events before relying on the new
  lifecycle handler. Stripe has no separate `refund.canceled` event; cancellation is
  reported as a Refund object with `status='canceled'` through `refund.updated`.
- Do not change the Stripe destination from this branch without explicit operator
  confirmation. Record the destination/event-selection evidence with the deployment
  evidence after merge.

## Local checks completed (task 1.8)

- Source-pin + behavior tests: `pnpm vitest run supabase/functions` (488 pass),
  `pnpm vitest run src/features/financial/` (32 pass).
- `pnpm typecheck` — 26/26 packages clean.
- `migration-auditor` run on both migrations: no FAIL findings.
- MYK9-63 refund-ledger follow-up: financial SQL harness passed (including
  migration re-runnability), 725 focused refund/payment/financial tests passed,
  and monorepo typecheck/lint plus OpenSpec validation passed. Direct `deno check`
  remains CI evidence because Deno is not installed in this workspace.

No historical backfill runs as part of any deploy: pre-existing orders keep NULL
snapshot columns and are reported rate-unverifiable / net-pending.
