# Database Drift Checks — 2026-06-12

Phase 3 of `docs/plan-dynamic-qa-infrastructure.md`.

Scope was read-only: no migrations, no Supabase pushes, no function deploys, and no external-system writes.

## Commands

- `supabase db advisors --linked --type all --level info --fail-on none --output-format json`
- `pnpm qa:db-drift:enum`
- `pnpm qa:db-drift:functions`
- `pnpm qa:db-drift:test`

Note: the advisor command was run from the primary checkout because the new worktree did not have the full ignored Supabase link metadata. The command was read-only and used `--fail-on none`.

The enum drift script defaults to repo migrations. To compare against a live schema dump instead, run `supabase db dump --linked --schema public --file /tmp/schema.sql` from a linked checkout, then `pnpm qa:db-drift:enum -- --schema-sql=/tmp/schema.sql`.

## Supabase Advisors Sweep

Total findings: 517.

| Level | Count |
| ----- | ----: |
| ERROR |     8 |
| WARN  |   365 |
| INFO  |   144 |

| Lint                                                 | Count |
| ---------------------------------------------------- | ----: |
| `unused_index`                                       |    95 |
| `multiple_permissive_policies`                       |    90 |
| `authenticated_security_definer_function_executable` |    84 |
| `anon_security_definer_function_executable`          |    82 |
| `auth_rls_initplan`                                  |    80 |
| `unindexed_foreign_keys`                             |    47 |
| `function_search_path_mutable`                       |    16 |
| `rls_policy_always_true`                             |     9 |
| `security_definer_view`                              |     8 |
| `public_bucket_allows_listing`                       |     2 |
| `duplicate_index`                                    |     2 |
| `rls_enabled_no_policy`                              |     1 |
| `auth_db_connections_absolute`                       |     1 |

### Error Findings

All 8 ERROR findings are `security_definer_view`:

- `public.judge_day_summary`
- `public.view_myk9q_entries`
- `public.view_stats_summary`
- `public.view_breed_stats`
- `public.view_entry_with_results`
- `public.view_judge_stats`
- `public.view_clean_sweep_dogs`
- `public.view_fastest_times`

Route: security-audit follow-up. Do not batch-fix blindly; confirm each view's intended caller and RLS boundary.

### High-Signal Warnings

- 166 security-definer function execute grants are exposed to `anon` and/or `authenticated`.
- 9 always-true write-capable RLS policies need intentionality review.
- 2 public storage buckets allow broad object listing: `images`, `premium-published`.
- 47 unindexed foreign keys and 90 multiple-permissive-policy findings are performance-shaped cleanup.
- `public.show_passcodes` has RLS enabled with no policies. This may be intentional if all access is via SECURITY DEFINER RPCs, but it needs explicit confirmation.

## Enum/CHECK Drift

The new `pnpm qa:db-drift:enum` script found one app-write value outside the latest parsed migration CHECK constraint:

| Table     | Column         | App value           | Constraint                   | Notes                                                                                                                                                                           |
| --------- | -------------- | ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entries` | `entry_status` | `scratch-requested` | `entries_entry_status_check` | Migration 142 normalized request statuses to hyphenated values, but migration 174 re-added only `scratch_requested` / `move_up_requested`. App code writes `scratch-requested`. |

Route: migration-auditor follow-up. The likely fix is a small migration restoring the hyphenated request values and backfilling any underscore rows, but do not push as part of this read-only phase.

Parser note: this is a heuristic drift detector, not a full TypeScript or SQL AST. It catches direct Supabase object-literal writes and simple local object variables, but nested object literals or values assembled through function returns can still produce false negatives.

## Edge Function Inventory

The new `pnpm qa:db-drift:functions` script compares `supabase functions list` against `supabase/functions/`.

- Matched: 19
- Deployed only: 8
- Repo only: 1

Deployed only:

- `cron-process-payouts`
- `cron-waitlist-expiration`
- `stripe-checkout`
- `stripe-connect-onboard`
- `stripe-customer-portal`
- `stripe-refund-entry`
- `stripe-upgrade-subscription`
- `stripe-webhook`

Repo only:

- `send-results`

Route: reconcile against current Stripe/payment branches before taking action. The Stripe/cron functions may be legitimate deployed work not present on this branch; `send-results` may be dormant repo code or an undeployed function.

## Testing

- RED confirmed: missing parser modules failed the new tests before implementation.
- GREEN confirmed: `pnpm qa:db-drift:test` passes with 9 tests.
- Function inventory regression covers the current Supabase pipe-table output and ignores `_shared` helper directories.
