# Security Audit — 2026-10-17

**Mode:** Full Audit (scheduled `claude-security-audit`, unattended)
**Source:** claude
**Baseline SHA:** `43b3912ad` (clean detached worktree from `origin/main`)
**Checklist version:** references/checklist.md @ `04be60937`
**Applied database:** staging project `sojmvhhwsjxmfistvzbe`. Read-only catalog queries only.
**Previous Claude report:** [`security-audit-2026-10-14.md`](security-audit-2026-10-14.md) (baseline `554046a07`)

**Linear:** no new P0, P1, P2 or P3 finding, so nothing was filed. Two comments were posted on existing issues (MYK9-1155, MYK9-1157) to record the current state. No issue was reopened. All Linear reads used `includeArchived: true`.

**Headline:** no P0 or P1. Three of the five 2026-10-14 findings are now fixed in code and the applied catalog. One is partly fixed, and one is unchanged. Live cold-anon probes and rolled-back authz replays were **not run** (see Coverage gaps), so several closures below rest on catalog and code evidence rather than replay.

## Summary

| Canonical     | Source severity | Count                                                     |
| ------------- | --------------- | --------------------------------------------------------- |
| P0            | —               | 0                                                         |
| P1            | —               | 0                                                         |
| P2            | —               | 0                                                         |
| P3            | LOW             | 0 new; 2 open residual (SA-2026-10-14-01 INSERT arm, -03) |
| **Total new** |                 | **0**                                                     |

Lifecycle status for the 2026-10-14 set:

| ID               | Lifecycle                               | Registry value                                                   | Canonical  |
| ---------------- | --------------------------------------- | ---------------------------------------------------------------- | ---------- |
| SA-2026-10-14-01 | `unchanged` (partly fixed)              | `open` (residual, accepted by owner rationale)                   | P3         |
| SA-2026-10-14-02 | `resolved`                              | `fixed`                                                          | — (was P2) |
| SA-2026-10-14-03 | `unchanged`                             | `deferred` (Linear MYK9-1157 is Canceled, owner decision needed) | P3         |
| SA-2026-10-14-04 | `blocked` (fix present, replay not run) | `in-progress`                                                    | P3         |
| SA-2026-10-14-05 | `blocked` (fix present, replay not run) | `in-progress`                                                    | P3         |

## Findings

No new findings this run.

The residuals below are carried from the 2026-10-14 report. Each is re-checked against the applied database.

### [P3 · source LOW] SA-2026-10-14-01 (residual): `dog_registrations_insert` still admits any secretary — MYK9-1155 (Done)

**Category:** RBAC & Privilege Escalation
**Status:** `unchanged` (partly fixed). UPDATE and DELETE are fixed. INSERT is not.
**Location:** live `dog_registrations_insert`; migration `20261014173100_myk9_1155_dog_registrations_write_scope.sql`
**Evidence (applied DB, 2026-10-17):**

- `dog_registrations_update` and `_delete` now read `can_edit_dog(dog_id)`. This closes the 10-14 exploit path for rewriting or deleting another exhibitor's registrations.
- `dog_registrations_insert` is `WITH CHECK (can_edit_dog(dog_id) OR (SELECT has_role('secretary')))`. `has_role()` with no club argument matches a secretary of any club.
- The migration's own comment records this as deliberate. A mail-in secretary must be able to add a dog's first registry number. The unique index `(dog_id, organization)` lets an INSERT only fill a missing registry, never replace one.
  **Risk:** A secretary of any club can add the first AKC/UKC/ASCA row for any dog on the platform. It cannot overwrite an existing number. The write is owner-accepted but wider than the show-scoped rule that governs the dog itself.
  **Fix (owner decision):** Either accept the fill-blank reach in writing and close the residual, or scope the INSERT arm to a dog with no account-holder owner, or to a dog tied to the secretary's shows.
  **Auto-fixable:** No (design decision).
  **Note:** MYK9-1155 is Done. The residual is not on that issue. A comment was posted on it.

### [P3 · source LOW] SA-2026-10-14-03: `fill_entry_owner_address` fills any account holder's blank address — MYK9-1157 (Canceled)

**Category:** RBAC & Privilege Escalation
**Status:** `unchanged`. The applied function body still matches the 10-14 evidence.
**Location:** applied `public.fill_entry_owner_address` (SECURITY DEFINER, `search_path=''`); migration `20261008213900_myk9_1010_fill_entry_owner_address.sql`
**Evidence:** The only gate is `can_manage_show(p_show_id)`. The owner is resolved from `p_dog_id` alone, with no tie to the show. The write has no `auth_user_id IS NULL` guard, so it can fill an account holder's blank fields. The function's EXECUTE is granted to `authenticated` only.
**Risk:** A manager of any live show can fill blank address fields on any account holder's person row, cross-club. Reading the same address already comes from `people_select`, so the new exposure is write-only.
**Fix:** Require the dog to be tied to `p_show_id`, and require `person_edit_allowed()` for the owner.
**Auto-fixable:** No.
**Owner action:** Linear MYK9-1157 is **Canceled**. This run did not reopen it. The owner should confirm whether the cancellation accepts the risk. If so, record it as `deferred` with a reason. If not, reopen it.

### [P3 · source LOW] SA-2026-10-14-04: dog creator and show arms — MYK9-1158 (Done), replay blocked

**Category:** RBAC & Privilege Escalation
**Status:** `blocked`. The fix is present, but the closure replay could not run.
**Evidence:** Applied triggers on `public.dogs` include `trg_00_guard_owner_change` (`dogs_guard_owner_change`). Migration `20261014191300_myk9_1158_dog_owner_change_guard.sql` describes a guard that refuses a non-owner write to `owner_id` or `co_owner_id` once the current owner has an account. The creator and show arms remain by design, as the migration documents.
**Proof gap:** A behavioural replay as an authenticated non-owner was not run. The MCP role cannot `SET ROLE authenticated`. The test is in `supabase/tests/dogs_update_secretary_created_dogs_test.sql`, which runs only in CI.
**Next proof:** Run the rolled-back `psql --db-url` replay, or confirm the CI SQL test passed on `main`. Then mark `resolved`.

### [P3 · source LOW] SA-2026-10-14-05: `classes.judge_signed_off_*` direct write — MYK9-1159 (Done), replay blocked

**Category:** RLS Policy Integrity
**Status:** `blocked`. The fix is present, but the closure replay could not run.
**Evidence:** Applied triggers on `public.classes` include `trg_00_block_direct_judge_sign_off_write` and `trg_00_block_direct_judge_sign_off_insert`, both calling `classes_block_direct_judge_sign_off_write`. Migration `20261014173700_myk9_1159_judge_sign_off_direct_write_guard.sql` is applied.
**Proof gap:** Same as SA-04. A rolled-back direct UPDATE as a manager was not run.
**Next proof:** As for SA-04.

## Resolved

### SA-2026-10-14-02: AskQ `get_class_summary` read Q/NQ counts through the service role — MYK9-1156 (Done)

**Status:** `resolved`.
**Evidence:**

- Commit `600077ef6` (`fix(askq): class summary reads Q/NQ counts through the caller's results view`) is on `main`. In `supabase/functions/_shared/askq/classAndTrialTools.ts`, the entry lookup now reads `ENTRY_RESULTS_VIEW` through `resultsClient`, with `applyShowScope` applied. The per-class counts come from that view.
- Applied catalog: `has_table_privilege('authenticated', 'public.entries', 'SELECT')` is **false**. `has_table_privilege('anon', 'public.entries', 'SELECT')` is **false**. `public.view_authenticated_entry_results` exists.
  **Proof gap:** No live AskQ tool invocation was run as an authenticated exhibitor. The closure rests on the code path and the catalog, not on a runtime replay. A runtime replay is still worth running in CI or on staging.

## Carried forward, not re-proved this run

These were marked resolved on 2026-10-14. Their catalog state is unchanged. Live cold-anon probes were denied this run, so they are not re-proved.

| ID                          | Status this run     | Basis                                                                                                |
| --------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| SA-2026-09-12-01 / MYK9-469 | carried, consistent | Anon `judge_assignments` and `armbands` policies unchanged in catalog.                               |
| SA-2026-09-12-02 / MYK9-470 | carried, consistent | Table ACLs for `vaccinations`, `offline_scoring`, `volunteer_roles`, `result_submissions` unchanged. |
| SA-2026-09-12-03 / MYK9-471 | carried, consistent | No edge-function change to the push webhook gate since 10-14 (see below).                            |
| SA-2026-09-12-04 / MYK9-472 | carried, consistent | Owner-run result views still `authenticated=r` and `anon=r` where expected.                          |
| SA-027 / MYK9-151           | unchanged, accepted | Unchanged.                                                                                           |

## Categories Checked

| Category                    | Examined                                                                                                                                                                                                                                                                                                                                               | Findings                 | Skipped                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------ |
| RLS Policy Integrity        | 142 public tables (`relrowsecurity` and `relforcerowsecurity` both true on all 142). Migrations since 2026-10-10 (17 files) scanned for policy, grant and table changes. Policies read for the new visibility tables, `dog_registrations`, `classes` triggers, `show_templates`, sport and rule tables.                                                | 0 new                    | Sequence re-check (not re-run) |
| Edge Function Auth          | 49 `index.ts` across the two trees. A crude grep for auth signals flagged 15. Nine are wrapper-gated with `auth: 'jwt'`, each opened and confirmed. Six `push-trigger-*` functions use `auth: 'none'` with `requirePushWebhookSecret`, confirmed by grep across all eight push-trigger functions. The other 34 were not individually re-read this run. | 0 new                    | Live POST probes (see gaps)    |
| RBAC & Privilege Escalation | `can_manage_show` (no judge or steward arm, confirmed), `can_edit_dog`, `dog_edit_allowed`, `fill_entry_owner_address`, `has_role`, owner-change trigger, judge sign-off guard                                                                                                                                                                         | 0 new (residuals 01, 03) | Rolled-back replays            |
| Client Auth Patterns        | Route and context changes since 2026-10-14 scanned for gate changes                                                                                                                                                                                                                                                                                    | 0                        | —                              |
| Data Exposure               | Anon table ACLs (18 tables) and anon column ACLs (`classes`, `dogs`, `judge_assignments`, `people`, `platform_settings`) compared with 10-14. `people` anon column grants on `email`, `first_name`, `last_name`, `id` are present and unchanged, and there is no anon `people` policy. MYK9-473 rejected them earlier.                                 | 0 new                    | Live cold-anon probes          |
| Payment Security (Stripe)   | No `stripe-*` function, `lib/stripe.ts`, `stripe-config.ts`, or `features/payments` change since `554046a07`. Webhook still uses `constructEventAsync` on the raw body.                                                                                                                                                                                | 0 new                    | Paid smoke (MYK9-125)          |
| Input Validation            | No `dangerouslySetInnerHTML`, `innerHTML` or `eval` regression surfaced in the changed app paths.                                                                                                                                                                                                                                                      | 0 new                    | —                              |

## Verified-good baseline (applied DB, 2026-10-17)

- **RLS:** `relrowsecurity` and `relforcerowsecurity` are true on all **142** public tables. The 10-14 count was 141. The new table has RLS forced.
- **Anon table grants:** 18 tables, matching 10-14. Each is `r`, except `platform_waitlist=a`, which is intentional public signup with a shape-checking `WITH CHECK` on `email`.
- **Anon column grants:** `classes`, `dogs`, `judge_assignments`, `people`, `platform_settings`. Same set as 10-14. No new anon column ACL.
- **Table ACL on `entries`:** `authenticated` has no table SELECT. Only column grants exist. Anon has none.
- **New visibility tables** (`class_visibility_overrides`, `show_visibility_settings`, `trial_visibility_overrides`): `anon=r`, `SELECT` open to `public`. Their rows are visibility toggles, so this is intentional and not a finding.
- **`classes.judge_signed_off_*` and `classes.results_verified_*`:** `trg_00_block_direct_*` triggers present on INSERT and UPDATE.
- **`dogs.owner_id` / `co_owner_id`:** `trg_00_guard_owner_change` present.
- **`dog_registrations` UPDATE and DELETE:** gated by `can_edit_dog()`.
- **`can_manage_show`:** no judge or steward arm.
- **`has_role`:** `anon` has EXECUTE. It is on the public keep-list of role predicates, as it was on 10-14.
- **Migrations since 10-10:** the new `CREATE POLICY`, `GRANT` and trigger statements were read. No new table received an `anon` grant. Any new table with an anon grant would have shown in the ACL query above, and none did.

## Previous Audit Comparison (vs 2026-10-14)

| ID                          | 10-14                | 10-17                            | Proof this run                                                                                   |
| --------------------------- | -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| SA-2026-10-14-01            | new (P2)             | **unchanged, partly fixed** (P3) | UPDATE and DELETE now `can_edit_dog()`. INSERT any-secretary arm kept by design. See above.      |
| SA-2026-10-14-02            | new (P2)             | **resolved**                     | Commit `600077ef6`. Authenticated has no `entries` SELECT. Counts read through the results view. |
| SA-2026-10-14-03            | new (P3)             | **unchanged**                    | Function body unchanged. Linear MYK9-1157 Canceled.                                              |
| SA-2026-10-14-04            | new (P3)             | **blocked** (fix present)        | Owner-change trigger present. Replay not run.                                                    |
| SA-2026-10-14-05            | new (P3)             | **blocked** (fix present)        | Sign-off direct-write guards present. Replay not run.                                            |
| SA-2026-09-12-01..04        | resolved             | carried, consistent              | Catalog unchanged. Live probes not re-run.                                                       |
| SA-2026-09-12-05 / MYK9-473 | rejected             | rejected                         | Anon `people` column grants unchanged.                                                           |
| SA-027 / MYK9-151           | unchanged (accepted) | unchanged (accepted)             | —                                                                                                |

## Observations (not filed)

- **Stripe Connect events, speculative defense in depth (carried from 10-14).** `stripe-webhook` does not check `event.account == null` before handling Connect-signed events. No exploit path was found. A cheap hardening would accept Connect-signed events only for `account.*` types.
- **Advisor warnings (carried).** `auth_allow_anonymous_sign_ins` is expected, because passcode ringside sessions are anonymous and the policies admit them deliberately.

## Coverage gaps (not passes)

- **Cold-anon live REST probes were not run.** The permission layer refused the probe command this run. The anon surface is evidenced by catalog ACLs and policies only. To close: a cold anonymous GET sweep on `people`, `dogs`, `entries`, `user_roles`, `show_passcodes`, `refund_requests`, `entry_carts`, `show_payments`, `dog_registrations`, `judge_assignments`, `armbands`, `shows`, `clubs`, and the three visibility tables, checking for 200 with rows versus 401 or empty.
- **Rolled-back authz replays were blocked.** The MCP role cannot `SET ROLE authenticated` (42501). SA-04 and SA-05 need a rolled-back `psql --db-url` session, or a passing CI run of their behavioural SQL tests.
- **Live edge-function POST probes were not run.** Edge-function auth is static review only this run.
- **Behavioural SQL under `supabase/tests/`** runs only in CI.
- **Sequence ACL re-check** (`relkind='S'`) was not re-run this run. The 10-14 result (only `registration_confirmation_seq` granted, `authenticated=rU`) is carried.
- **MYK9-125 paid smoke** was not run, because it moves money.

## Process notes

- **Labels:** the prompt's `p0`/`p1`, `source:claude` and `audit:security` labels still need checking in the workspace. This run filed nothing, so it did not depend on them. The 10-14 run reported they did not exist.
- **Linear state drift:** MYK9-1157 (a live, unchanged P3) is Canceled, with no recorded owner decision. Under `quality-finding-lifecycle` this is `deferred` only if the owner accepts it.
- **Coverage honesty:** three of the five 2026-10-14 closures are "fix present, replay pending or CI-only". They are not `resolved` until a replay or CI result is recorded.
