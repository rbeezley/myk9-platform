# Current closure evidence

Captured 2026-08-25 against project `sojmvhhwsjxmfistvzbe` and current `main`.

## MYK9-243

- Exact Linear issue is Done and links merged PR #1778 / commit `8fea39cda`.
- Applied replay covered stale entry value versus canonical armband, suffixed canonical and fallback labels, numeric labels, and missing labels.
- Deployed RPC output preserved `12A`, preferred canonical `112` over stale `104`, and renderer checks covered score, check-in, and catalog output/order.
- Closure remains owned by MYK9-243; this change does not duplicate its implementation.

## MYK9-236

- Exact Linear issue is Done and links merged PRs #1779/#1780.
- Migration `20260824210000` is applied and `cron-health-check` v31 was deployed.
- Live read-back recorded 130 service-role table facts, zero drift, all eight hosted privileges on `sms_proximity_sends`, and the deliberate no-INSERT exception on `entry_status_history`.
- Closure remains owned by MYK9-236; this change does not duplicate its implementation.

## MYK9-161 recurrence

- Read-only live replay at `2026-08-25T12:49:42Z`: current applied ACL check `ok`; controlled in-memory `classes` table grant `fail`; protected class columns remain withheld.
- Five consecutive snapshots from `12:25Z` through `12:45Z` carry `anon_grants=ok` and `applied_acl_grants=ok`.
- Current details: 19 anon table grants (1 write), 89 allowlisted columns, 130 authenticated/service-role table contracts, and 4 public sequences with no forbidden privilege/default drift.
- The latest overall status is `warn`, not `fail`; the remaining warning is unrelated to ACL drift.

## Email idempotency pre-deployment state

- Hosted inventory contains all 45 repository functions with no deployed-only or repo-only names.
- `send-waitlist-invite` v37 and `cron-process-payouts` v32 are ACTIVE with `verify_jwt=false`; these are the rollback anchors.
- Downloaded bundles match current handlers and all extracted shared dependencies except the known target helper drift. `send-waitlist-invite` also lacks current localhost-only CORS aliases; deploying reviewed source changes no production origin behavior.
- Both deployed bundles still contain the content-derived SHA-256 fallback key. Current repository helpers use a fresh opaque invocation key, remain byte-identical across both deployment roots, and both affected handlers import that local helper.
- Controlled test proof: retry attempts in one invocation reuse one key; two identical-body logical invocations use distinct keys and receive distinct controlled provider response IDs.

## Migration preflight

- Hosted `sms_proximity_sends` has only `(auth_user_id, entry_id)` primary-key and `sent_at` indexes; no equivalent `entry_id`-leading index exists.
- Linked dry-run did not mutate the database. It found prior merged migration `20260824220000_myk9_245_keep_own_cancelled_entries_visible.sql` missing before hosted `20260824223000`, so a normal push is blocked and `--include-all` would widen scope. The unrelated MYK9-245 migration requires its own approval/reconciliation before this change's index can be applied normally.
- The corrected phase-2 SQL ran in a read-only transaction against staging: all six rows passed, including one active `cleanup-ringside-anon` cron row.

## Implementation verification

- Repository changes are published in PR #1792: `https://github.com/rbeezley/myk9-platform/pull/1792`.

| Dimension | Result |
| --- | --- |
| Completeness | 12/21 tasks complete; repository implementation, local/read-only verification, and PR publication are complete; review/CI, deployment, Linear, archive, and cleanup gates remain. |
| Correctness | The two new assertions failed before implementation and passed afterward. Focused tests, database drift tests, full typecheck, full lint, strict OpenSpec validation, live phase-2 SQL, function inventory, bundle downloads, ACL replay, and index catalog preflight agree with the design. |
| Coherence | No duplicated product surface or new data path. The migration is additive, the cron assertion uses the scheduler identity, and both email deployment roots remain byte-identical at the target helper. |

No CRITICAL, WARNING, or SUGGESTION implementation finding remains. The change is not archive-ready because review/CI, merge, and explicit shared-system approval gates are intentionally incomplete.
