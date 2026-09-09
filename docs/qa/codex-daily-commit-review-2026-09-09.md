# Codex daily commit review — 2026-09-09

> **Status:** Reference

## Window and outcome

- Source: codex; automation `nightly-commit-review`; methodology `quality-finding-lifecycle`, with automatic Linear tracking at every severity.
- Shared starting SHA (exclusive): `44857161a1a573e411ef13d86e31a7e04545e93e`. Reviewed all **15 first-parent descendants** through main/origin/main `488e6c3d60d7c88c477b8bfc2aa675b331afff6e`.
- Continuous window: **2026-09-08T10:09:18Z–2026-09-09T10:11:29Z**. No fallback or SHA/time coverage gap. Final remote fetch still matched the reviewed tip.
- **Two new actionable observations, five newly resolved prior findings, one blocked original verification gate.** Created MYK9-452; updated seven existing Linear records. No issues closed. No application code changed. OPSX implementation is not applicable to this audit.

| Lifecycle            | Count |
| -------------------- | ----: |
| New                  |     2 |
| Unchanged            |     0 |
| Resolved             |     5 |
| Blocked verification |     1 |
| Duplicate            |     0 |
| Rejected             |     0 |

Unresolved: **P0 0 / P1 1 / P2 2 / P3 0**. Classification: one SQL product regression, one operational backup-cadence failure, one payment verification prerequisite. Counts cover this review and its existing reconciliation scope, not the entire board. All records below use the reviewed baseline and `source: codex`.

## P1 — new self-check-in regression

### NCR-2026-09-09-01 / MYK9-452

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-452). **New; source High; unassigned database/check-in maintainer.** First/last seen September 9; one audit; high confidence from actual PostgreSQL execution.

[PR #2141](https://github.com/rbeezley/myk9-platform/pull/2141), merge `f8b497685`, replaces `self_checkin_entry` in [migration 20260908134900:36–45](https://github.com/rbeezley/myk9-platform/blob/488e6c3d60d7c88c477b8bfc2aa675b331afff6e/supabase/migrations/20260908134900_reject_null_self_checkin_status.sql#L36-L45). The UPDATE target alias `e` is referenced inside its FROM join's ON clauses:

```sql
update public.entries e
set check_in_status = p_new_status, updated_at = now()
from public.dogs d
left join public.classes c on c.id = e.class_id
```

PostgreSQL rejects that reference when the statement executes. Every allowed-status call by a person-linked caller fails before updating the entry. The function can be created successfully because PL/pgSQL prepares the statement at execution. The new NULL rejection works but does not exercise this path.

**Focused proof:** disposable PostgreSQL 18, synthetic caller/person/dog/entry, and minimal referenced schemas. Installed the complete unchanged function from migration `20260604004045`: the owned entry changes from `no-status` to `checked-in`. Reset the synthetic entry, install the complete unchanged function from `20260908134900`, and repeat the same call: `ERROR: invalid reference to FROM-clause entry for table "e"`; the row remains `no-status`. A NULL call correctly rejects with `Status <NULL> is not allowed for self-check-in`. This was a local isolated replay; no shared database or fixture was mutated.

The affected online exhibitor path is [checkInStatus.ts:36–46](https://github.com/rbeezley/myk9-platform/blob/488e6c3d60d7c88c477b8bfc2aa675b331afff6e/apps/myk9show/src/services/show-day/checkInStatus.ts#L36-L46), used by My Shows and exhibitor at-show actions. Staff retain their separate replication-backed writer. Impact: the exhibitor cannot self-check in and needs staff intervention; no score corruption or platform-wide outage is asserted.

The existing `selfCheckInRlsContract` and `selfCheckinBatch` suites pass **10/10**, while no `self_checkin_entry` behavioral invocation exists under `supabase/tests`. The contract only checks text and the batch tests mock reads. MYK9-441's September 8 closure comment records the migration applied and definitions inspected, but its successful live RPC proof calls `get_account_today_entries`, not this function. Applied state is attributed to that record; this audit did not invoke a live mutation.

**Next/closure:** forward migration preserving ownership, status whitelist and class→trial→show visibility precedence; behavioral SQL positive handler/owner/co-owner cases and negative outsider/anonymous/NULL/disabled cases, with persisted status assertions. Then separately authorized application and owned exhibitor browser/RPC read-back. Preserve completed MYK9-441 read-latency and MYK9-309 client fail-closed scope. Archived-inclusive searches by RPC, workflow and SQL symptom, exact candidate issues, history and current main found no duplicate or subsequent fix.

## P2 — backup operation and payment proof

### NCR-2026-09-09-02 / MYK9-110 — first scheduled due slot missed

[Canonical parent](https://linear.app/myk9-platform/issue/MYK9-110). **New observation under the existing scheduled-run follow-up; source Medium; owner Richard Beezley.** First/last seen September 9; one audit. High confidence in failed-run evidence; scheduler cause unconfirmed.

[Health run 34336905277](https://github.com/rbeezley/myk9-platform/actions/runs/34336905277) failed at **09:50:34Z**: due slot `2026-09-09T08:00:00.000Z` (03:00 Chicago), latest manifest `2026-09-09T00:08:23.086Z`. [Automatic GitHub alert #2147](https://github.com/rbeezley/myk9-platform/issues/2147) is open. At final 10:11Z inspection the latest scheduled exporter run was still [34323285344](https://github.com/rbeezley/myk9-platform/actions/runs/34323285344), started **07:19:45Z**, before the due slot, with success. No later export run was listed.

Expected: a verified export after the configured due slot; alert if missed. Observed: the alert works, but the scheduled recovery cadence is not yet established. This is an operational missing-export observation, **not a confirmed selector/dump defect**, backup loss, or evidence of an accepted weekday RPO breach. The documented 30-minute grace intentionally exposes scheduler delays. Scope: `independent-database-exports.yml:6–7`, `independent-database-export-health.yml:4–6`, and `export-model.ts:138–160`.

**Next/closure:** inspect delayed/missing dispatch, record a post-due scheduled catch-up manifest and verified payloads, then independent health success and subsequent cadence evidence, including the hourly weekend interval before relying on its target. Manual dispatch, configuration changes and export/deletion operations retain their existing authorization gates; none were performed. Preserve newest complete recovery set and freshness-before-retention policy. Also reconcile the export runbook's obsolete disabled/UTC/approval-pending assertions with the recorded September 9 activation. Full fresh-project, Storage and application-failover requirements remain separate in MYK9-110. Archived-inclusive searches and exact parent/comments read; no duplicate backup issue created.

### MYK9-423 — existing-entry payment completion

[Canonical contract](https://linear.app/myk9-platform/issue/MYK9-423). **Blocked verification; source High historical; owner Richard Beezley.** First seen September 6; last checked September 9; fourth daily observation. Reopened **In Review**, preserving implemented scope. No current financial failure is claimed.

[#2140](https://github.com/rbeezley/myk9-platform/pull/2140) adds a passing direct-URL test at `CartPage.hydration.test.tsx:109–122`: exact show/entry parameters reach a mocked `loadActiveCart`. It does not drive the fee-card CTA through real hydration and assert actual items/total, as original AC4 asks. Separate store tests cover recovery. [#2142](https://github.com/rbeezley/myk9-platform/pull/2142), merge `8b261f81c`, keeps already-submitted entries payable when classes fill or capacity requests fail, while mixed carts retain cart-wide fail-closed behavior.

The #2142 PR records hosted exact cart recovery and fail-closed behavior, but expressly leaves successful payment replay pending deployment. No later same-entry-ID payment/both-balances-clear/no-duplicate-or-refund proof appears in the inspected exact issue/comments/PRs.

**Next/closure:** attach existing end-to-end proof first; otherwise separately authorized owned sandbox fee-card→recovered cart→paid same entries→both balances clear replay, including a full-class recovery. Add/identify the real CTA-to-hydrated-cart composition regression. Merging, generic CI and direct-URL/mock tests do not satisfy the remaining original criteria.

## Newly resolved findings

Exact Linear issues and all comments were read. These resolutions combine repository/focused proof with the recorded operational evidence; this audit did not repeat hosted browser/database work. Existing Done states preserved; no closure operation performed.

| Canonical ID                                                                   | Severity / source | First seen / last checked                        | Closure evidence                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MYK9-435](https://linear.app/myk9-platform/issue/MYK9-435), NCR-2026-09-07-01 | P2 / Medium       | Sep 7 / Sep 9; 3 daily observations              | Sep 8 13:35Z comment: actual `/shows?month=2026-01` and `2028-01` Tab/arrow replay, one tab stop, focus/aria/URL changes. #2124 source retained; focused components pass.                            |
| [MYK9-438](https://linear.app/myk9-platform/issue/MYK9-438), SHD-2026-08-31-01 | P2 / Medium       | Aug 31 / Sep 9; cross-audit count not normalized | Sep 8 13:34Z current bare-array exports: Security 254→254, Performance 188→188, classified 442, zero unclassified. Current DB-drift 34/34 passes.                                                    |
| [MYK9-427](https://linear.app/myk9-platform/issue/MYK9-427)                    | P3 / Low          | Sep 7 / Sep 9; 3 daily observations              | #2143 real-hook fallback/account-switch tests pass; Sep 8 comment records signed-in approximate city, Distance/miles, remembered Anywhere/reload, no device prompt, green production at `25e6c13b9`. |
| [MYK9-436](https://linear.app/myk9-platform/issue/MYK9-436), NCR-2026-09-07-02 | P3 / Low          | Sep 7 / Sep 9; 3 daily observations              | Sep 8 13:35Z measured 375/768/1440 × light/dark: ≥14px captions, 44px detail control, no horizontal overflow, panel/keyboard intact. Current components pass.                                        |
| [MYK9-439](https://linear.app/myk9-platform/issue/MYK9-439), SHD-2026-09-07-02 | P3 / Low          | Aug 31 / Sep 9; cross-audit count not normalized | Sep 8 application and catalog comments: migration 20260907150000 applied, all five indexes valid, full-schema query returns zero uncovered single-column public FKs.                                 |

Owners: Richard Beezley for MYK9-427/438/439; MYK9-435/436 remain unassigned historical UI findings. All five descriptions now carry the dated resolution proof rather than ending at yesterday's blocked status.

## Coverage, verification and limits

Reviewed backup export/encryption/manifest/retention/decryption code, workflows/client installation, restore/activation docs; AKC/UKC report accounting, identity and PDF dispatch; geo host gate/fallback/account isolation; dog-registration projection; panel focus; payment hydration/capacity; account-today and self-check-in migrations; review-process PID/token tracking; skill/shared-rule changes.

Final merged code includes intermediate review repairs: backups bind project/destination, verify payload bytes before publishing success, retain the newest complete set, separate daily retention and guard approved destination; location disables prior-account placeholders; payments avoid counting recovered seats twice and preserve mixed-cart failure handling. No stale intermediate defect was filed. MYK9-441's recorded latency/Nightly proof remains valid for that historical scope; MYK9-452 is a separate newly introduced write-path defect.

Local checks in owned worktree `/private/tmp/myk9-ncr-review-20260909`:

- **397 tests passed across 48 files**: backup/review wrapper 108; organization forms/capacity 100; location/panels 53; CartPage/fulfillment 25; self-check-in contracts/batch 10; dog registrations/AKC submission 20; report registry/mapping 41; month/alert 6; DB-drift 34.
- App TypeScript and backup TypeScript pass. Bootstrap restored 12 cached workspace package builds; no package sources changed in this range.
- Disposable PostgreSQL before/after owned-entry proof confirms MYK9-452. This deliberately failing current-function call is a finding, not a passing test. No shared DB was contacted. Initial sandbox `initdb` failed on shared-memory permission; escalated local-only replay succeeded.
- Reviewed-range `git diff --check` passes. Report/cursor edits separately checked before commit.
- [Main CI 34294100756](https://github.com/rbeezley/myk9-platform/actions/runs/34294100756) at the reviewed tip succeeded: all six app shards, full coverage/gate, SQL, packages, quality and build. Documentation-tip E2E/A11y smoke skipped. The SQL success does not cover execution of the broken function. Backup health failed separately as reported above.

Limits: no full local app suite, browser/E2E, live SQL mutation, payment, deployment, backup dispatch/download/deletion, shared-fixture change, load or physical-device proof. Existing dependencies were used via owned worktree symlinks. GitHub sandbox DNS initially failed; escalated read-only fetch/PR/run inspection succeeded. No Linear filing blocker. Temporary synthetic PostgreSQL data and test links are audit scratch only.

## Reviewed commit inventory

Chronological first-parent order: `a4e89353a`; `1103bc860` (#2129); `50cd71ddf` (#2134); `d04d74f93` (#2132); `7ecc6db74` (#2135); `18b3e55ab` (#2137); `10ef2f878` (#2131); `f69bffade` (#2139); `b14fc940c` (#2140); `f8b497685` (#2141); `8b261f81c` (#2142); `9b7f4f8f1` (#2138); `25e6c13b9` (#2143); `62f7562b0` (#2136); `488e6c3d6`.

Shared cursor stamped only through `488e6c3d6`. This report's documentation commit remains for the next run. Linear holds all actionable work; this report and automation memory retain evidence/history/cursors.
