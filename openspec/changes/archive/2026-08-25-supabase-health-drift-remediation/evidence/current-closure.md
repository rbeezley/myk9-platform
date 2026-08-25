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

## Email idempotency deployment closure

- Hosted inventory contains all 45 repository functions with no deployed-only or repo-only names.
- Pre-deployment rollback anchors were `send-waitlist-invite` v37 and `cron-process-payouts` v32.
- After explicit approval, `send-waitlist-invite` v38 became ACTIVE at `2026-08-25T13:30:26Z` and `cron-process-payouts` v33 became ACTIVE at `2026-08-25T13:31:03Z`, both with internal auth (`verify_jwt=false`).
- Downloaded v38/v33 handlers and `resendEmail.ts` helpers byte-match their reviewed deployment roots. Both deployed helpers now use a fresh opaque key per logical invocation and reuse that key only for retries.
- Controlled test proof: retry attempts in one invocation reuse one key; two identical-body logical invocations use distinct keys and receive distinct controlled provider response IDs.
- Credential-free POST smokes returned HTTP 403 for both functions before any email or payout action. No production email or transfer was triggered.

## Migration deployment and read-back

- The approval-gated dry run listed exactly `20260824220000_myk9_245_keep_own_cancelled_entries_visible.sql` and `20260825130000_sms_proximity_entry_index.sql`; both applied successfully and now match local/remote migration history.
- Live catalog read-back shows `sms_proximity_sends_entry_id_idx` as a B-tree index led by `entry_id`, covering the existing `sms_proximity_sends_entry_id_fkey` cascade constraint without changing the `(auth_user_id, entry_id)` idempotency primary key.
- Live view-definition read-back confirms the MYK9-245 predicate preserves an exhibitor's own deleted entry while retaining the prior live-row boundary for other callers.
- The corrected phase-2 SQL ran in a read-only transaction against staging: all six rows passed, including one active `cleanup-ringside-anon` cron row.

## Implementation verification

- Repository changes passed all required checks and merged in PR #1792 as `d98256382944a2d9114e7db5b66e402e71f8fe87`: `https://github.com/rbeezley/myk9-platform/pull/1792`.
- The approved Linear batch added sanitized recurrence-closure evidence to exact issue MYK9-161 while preserving its correct Done state. MYK9-236 and MYK9-243 already contained complete deployed closure comments, and no duplicate issue was created for resolved report-only SHD findings.

| Dimension | Result |
| --- | --- |
| Completeness | 21/21 tasks complete; repository implementation, review/CI, approved deployment, hosted read-back, merge, Linear reconciliation, archive, and cleanup gates all passed. |
| Correctness | The two new assertions failed before implementation and passed afterward. Focused tests, database drift tests, full typecheck, full lint, strict OpenSpec validation, live phase-2 SQL, function inventory, bundle downloads, ACL replay, and index catalog preflight agree with the design. |
| Coherence | No duplicated product surface or new data path. The migration is additive, the cron assertion uses the scheduler identity, and both email deployment roots remain byte-identical at the target helper. |

No CRITICAL, WARNING, or SUGGESTION implementation or deployment finding remains. All proof and governance gates passed; the change is archive-ready.
