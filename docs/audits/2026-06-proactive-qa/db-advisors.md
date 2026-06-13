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

The new `pnpm qa:db-drift:functions` script compares `supabase functions list` against both deployable function roots: `supabase/functions/` and `apps/myk9show/supabase/functions/`.

- Matched: 27
- Deployed only: 0
- Repo only: 2

Deployed only:

- None

Repo only:

- `receive-logs`
- `send-results`

Reconciliation note (2026-06-13): the original deployed-only Stripe/cron list was a false positive caused by scanning only the root function directory; those functions live under `apps/myk9show/supabase/functions/` and are deployed. The remaining repo-only functions need separate product decisions: `send-results` is invoked by the Results Submission page and likely needs a confirmed deploy before that email path can work, while `receive-logs` has no current app invocation and should stay undeployed unless frontend remote logging is re-enabled deliberately.

## Testing

- RED confirmed: missing parser modules failed the new tests before implementation.
- GREEN confirmed: `pnpm qa:db-drift:test` passes with 9 tests.
- Function inventory regression covers the current Supabase pipe-table output, scans both function roots, dedupes duplicated function names, and ignores `_shared` helper directories.
