# Security Audit — 2026-10-31

**Mode:** Full Audit (scheduled `claude-security-audit`, unattended)
**Source:** claude
**Baseline SHA:** `3f268b7c6` (clean worktree from `origin/main`)
**Checklist version:** references/checklist.md @ `04be60937`
**Applied database:** staging project `sojmvhhwsjxmfistvzbe`. Read-only catalog queries only. No writes. Cold-anon REST probes were declined by the permission layer this run (see Coverage gaps).
**Previous Claude report:** [`security-audit-2026-10-24.md`](security-audit-2026-10-24.md) (baseline `3590ee292`)

**Linear:** every write succeeded; nothing is unfiled. See § Linear writes.

## Summary

| Canonical | Source severity | Count |
| --------- | --------------- | ----- |
| P0        | —               | 0     |
| P1        | —               | 0     |
| P2        | —               | 0     |
| P3        | LOW             | 1     |
| **Total** |                 | **1** |

Auto-fixable: 0 of 1. The fix is a one-line `PERFORM`, but whether to gate or exempt is an owner decision.

Lifecycle status:

- **New:** 1.
- **Resolved:** 3 of the 2026-10-24 findings, re-proved this run (SA-01, SA-03, SA-04).
- **Fixed, not live-replayed:** 1 (SA-02). The fix is in the deployed bundles, but no stale-JWT replay was run.
- **Unchanged:** SA-027 (accepted risk).
- **Blocked:** MYK9-125's paid smoke, carried over.

## Findings

### [P3 · source LOW] SA-2026-10-31-01: `hard_delete_show` has no step-up re-auth — MYK9-1588

**Category:** RBAC & Privilege Escalation (step-up coverage)
**Location:** `supabase/migrations/20261029034700_myk9_1472_hard_delete_show_money_guards.sql`, the gate at the start of the function body. Client caller: `apps/myk9show/src/services/database/shows/writes.ts`.
**Evidence (applied DB):** `public.hard_delete_show` is `SECURITY DEFINER`, `search_path=''`, and `authenticated` holds EXECUTE. Its definition contains `is_platform_admin()` and no `require_recent_reauth`. The other irreversible or power-granting site-admin paths all carry the gate:

- `create_role_with_permissions` and `update_role_with_permissions` (live definitions contain `require_recent_reauth`)
- `grant_club_secretary`
- `admin-delete-user` and `admin-invite-user`

`docs/plan-step-up-reauth.md` puts the function on neither its gated list nor its "Deliberately not gated" list.

**Risk:** Someone with a weeks-old site-admin session on an unlocked laptop can permanently delete a show without re-entering a password. The impact is bounded: the MYK9-1472 manifest refuses any show with orders or retained children, so in practice only unused shows can be deleted. There is no authorization bypass.
**Fix:** Owner decision. Either add `PERFORM public.require_recent_reauth();` after the admin check (the client `stepUpFetch` replay already handles `MKAUT`), or list the function as deliberately not gated, with the reason.
**Confidence:** high on the mechanism, low on the impact.

## Observations (not filed)

- **`private.user_access_epoch` has RLS enabled but not forced** (`20261029192700`). The only ACL is `postgres=arwdDxtm`, it is in the `private` schema, and no client role holds a grant. Hygiene only.
- **`entry_results_changed_since` leaks one show-wide activity bit** (`20261031014300`). An exhibitor with an entry in a show learns whether any entry, dog or person row in that show changed since a timestamp. The migration documents this ("may be TRUE for a row the caller cannot see"). `caller_has_access` distinguishes a real show id from a missing one, but show ids are unguessable UUIDs. Informational.
- **The MYK9-1395 notice caps the club name at 80 characters, but not the creator's name.** The creator name comes from `people.first_name`/`last_name`, which the caller controls. The fold to one row per creator per admin bounds the volume, so only the text length is unbounded. Cosmetic.
- **Trigger-owned `entries` columns are UPDATE-able by `authenticated` at table level.** The columns are `payment_status_before_comp`, `check_in_status_before_pull`, `placement_tie` and `placement_tiebreak`; `entries` relacl is `authenticated=awd`. The guarding triggers are live and discard client values: `trg_00_block_direct_placement_tie_insert/_write`, plus the 1407 and 1396 triggers. `authenticated` and `anon` have no SELECT on these columns. No finding.
- **Stripe Connect events still reach the platform event switch** (`stripe-webhook/index.ts:253`). Carried from 2026-10-14. Both webhook secrets verify the signature on the raw body, so forgery is impossible, and orders are keyed on the session id.
- **The offline RBAC cache `myk9show:rbac-cache:<userId>` survives an explicit sign-out.** It is cleared on a user switch, not on logout (MYK9-200 design). It holds role and permission names only, keyed by user. The new warm-paint token (`rbacWarmToken.ts`) is purged on sign-out, on the account boundary and on a user switch, so a purged session cannot reuse the copy.
- **Advisor:** unchanged in shape from last run.
  - 120 `auth_allow_anonymous_sign_ins` (passcode ringside sessions, deliberate).
  - 1 `security_definer_view` (the owner-run result views, MYK9-472).
  - 1 anon and 1 authenticated definer-executable (the documented keep-list).
  - 1 `rls_enabled_no_policy` info group.
- **Labels:** `p0`/`p1`, `source:claude` and `audit:security` still do not exist (sixth run), and `Claude` is now retired. Issues carry `Bug` and the priority field; the source and audit tags are in the issue text.

## Rejected / not re-raised

- **`set_class_judge` excluding judges and stewards:** correct. The gate is `is_site_admin() OR is_show_office_manager(show)`; a class's judge is assigned by the office, not by the judge.
- **`ringside_update_class` admitting no steward:** unchanged from 1098 by design. It admits a manager, the assigned judge (confirmed or invited), or a judge/admin passcode claim with a generation check.
- **`create_role_with_permissions` / `update_role_with_permissions` allowing edits to `is_system` roles:** site-admin-only and step-up gated, the same reach as the earlier client path.
- **`people.email` anon column grant:** the earlier rejection (MYK9-473) holds. Anon `people` reads return no rows under RLS (last proved 2026-10-24 by cold probe; not re-probed this run).
- **Earlier rejections still hold:**
  - judge qualifications policies (MYK9-354)
  - the `dog_registrations_insert` secretary arm
  - `create_dog_with_registrations`
  - the boolean-oracle RPCs
  - `review_club_access_request` proacl
  - admin routes
  - the `send-results` comment
  - clubs email/phone
  - the premium UUID regex
  - `is_show_secretary` with `show_id IS NULL`

## Categories Checked

| Category                    | Examined                                                                                                                                                                                                                                                                                                            | Findings | Skipped               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------- |
| RLS Policy Integrity        | 143 public tables live (FORCE on all); 18 migrations since `3590ee292`, all read in full; new table `timezone_names`; relacl, attacl, view reloptions; triggers on `entries`, `user_roles`, `clubs`                                                                                                                 | 0        | —                     |
| Edge Function Auth          | 48 deployed, all `verify_jwt=false` by design, no new function directories; every changed function read in full; deployed bundles of `stripe-payment-link`, `stripe-connect-onboard` and `admin-delete-user` inspected                                                                                              | 0        | live POST probes      |
| RBAC & Privilege Escalation | `user_roles` / `roles` / `permissions` / `role_permissions` write policies (site admin or platform admin only); 1409 role RPCs; `hard_delete_show`; `set_class_judge`; `set_class_tie_order`; `mark_class_results_verified`; `ringside_update_class`; club-delete role deactivation; 335 SECURITY DEFINER functions | 1 (01)   | rolled-back replay    |
| Client Auth Patterns        | new `/at-show/:showId/dogs`, `/dogs/:dogKey` and `/setup-sheet` routes (`AtShowAccessGate`); `/club-admin/payments/:clubId` (`ClubAdminRoute`); RBAC warm token and cache lifecycle; `useAuth` sign-out purge                                                                                                       | 0        | —                     |
| Data Exposure               | anon table grants (19 tables + 1 view); anon column grants (`classes`, `dogs`, `judge_assignments`, `people`, `platform_settings`); the new `classes.ring_phase*` columns are authenticated-only; changed-since feeds                                                                                               | 0        | cold-anon REST probes |
| Payment Security            | `stripe-payment-link` (CRON bypass removed), `stripe-connect-onboard` (step-up), webhook raw-body verification, `refunds.create` call sites, `VITE_STRIPE_*` (price ids and livemode only), live `stripe_orders_select`                                                                                             | 0        | paid smoke            |
| Input Validation            | no new `dangerouslySetInnerHTML`, `innerHTML` or `eval`; the new `.or(` is a static string; `returnTo` targets are internal `navigate()` paths; `hard_delete_show`'s dynamic SQL uses `%I` on catalog-derived identifiers only                                                                                      | 0        | —                     |

## Verified-good baseline (applied DB, 2026-10-31)

- **Migrations:** `schema_migrations` ends at `20261031014300`. All 19 versions after `20261022131700` are applied, including last run's missing `20261023154300`.
- **RLS:** enabled and forced on all **143** public tables (142 last run). The addition is `timezone_names`: forced RLS, no policies, ACL `postgres` and `service_role` only.
- **Anon table grants:** 20 relations, all `r` except `platform_waitlist=a`. Nothing new since last run.
- **Anon column grants:** on `classes` (51 columns), `dogs` (5), `judge_assignments` (10), `people` (4) and `platform_settings` (3).
  - `classes.ring_phase` and `ring_phase_time` are `authenticated=r` only.
  - `entries` has no anon column grant.
- **SECURITY DEFINER functions:** 335 (328 last run), none without a `search_path`, 10 on `search_path=public` (11 last run, SA-027).
- **Anon-executable definers:** 17, the same keep-list as last run. New anon-callable wrappers (`get_shows_judges`, `get_shows_class_hide_counts`) are INVOKER over the gated per-show definers.
- **New definers:**
  - `hard_delete_show`, `entry_results_changed_since`, `entry_results_caller_has_no_show_access`, `my_entry_payment_link_session_ids`, `set_class_tie_order`, `mark_class_results_verified`, `create_role_with_permissions` and `update_role_with_permissions` are `search_path=''`, with EXECUTE for authenticated and service_role only.
  - `get_account_today_entries_at` and `recalculate_class_placements` are service_role only.
  - `replace_role_permission_codes` is INVOKER and postgres-only.
- **Views:** `view_authenticated_entry_results` and `_replication` keep an inline `security_invoker=false`, with `authenticated=r` and no anon.
- **`shows`:** no DELETE policy, and `authenticated` lacks DELETE (MYK9-1472).
- **Role tables:** writes to `user_roles` are gated by `is_site_admin()`, and writes to `roles`, `permissions` and `role_permissions` by `is_platform_admin()`.
- **New triggers live:**
  - `trg_user_roles_refuse_deleted_club_grant_ins` and `_upd`
  - `trg_user_roles_touch_access_epoch`
  - `trg_clubs_deactivate_role_grants_on_delete`
  - `trg_00_block_direct_placement_tie_insert` and `_write`
- **Edge functions (deployed):**
  - `stripe-payment-link` v30 contains zero `CRON_SECRET`, `x-function-secret` and `isInternalCall` strings.
  - `stripe-connect-onboard` v29 and `admin-delete-user` v57 call `stepUpRefusal` after the role check.
  - `refunds.create` appears only at the three human-action functions plus the shared refund helper.

## Previous Audit Comparison (vs 2026-10-24)

| ID                                       | Then                 | Now                                           | Proof this run                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | -------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SA-2026-10-24-01 / MYK9-639              | new                  | **resolved**                                  | `20261023154300` is in `schema_migrations`; `my_entry_payment_link_session_ids` is live (DEFINER, `search_path=''`, no anon); live `stripe_orders_select` has the third arm, `customer_id IS NULL AND stripe_checkout_session_id IN (my_entry_payment_link_session_ids())`.                                    |
| SA-2026-10-24-02 / MYK9-1393 (In Review) | new                  | **fixed in deployed code, not live-replayed** | The deployed bundles of `stripe-connect-onboard` v29 and `admin-delete-user` v57 call `stepUpRefusal` after the role check. `admin-invite-user` v13 was deployed in the same batch, and its source gates at `inviteUserHandler.ts:257`. A stale-`amr` JWT replay was not run. Evidence commented on MYK9-1393. |
| SA-2026-10-24-03 / MYK9-1394 (Done)      | new                  | **resolved**                                  | The deployed `stripe-payment-link` v30 has no `CRON_SECRET` or `x-function-secret` read. Every request requires `auth.getUser`, then the secretary, club-admin or site-admin RPCs, or the exhibitor's own unexpired waitlist offer.                                                                            |
| SA-2026-10-24-04 / MYK9-1395 (Done)      | new                  | **resolved**                                  | The live trigger body takes an advisory lock per `auth.uid()`, then DELETE plus INSERT keyed on `deep_link_url = '/admin/onboarding?creator=<uid>'`, so there is one notice per creator per admin. The club name is capped at 80 characters.                                                                   |
| SA-027 / MYK9-151                        | unchanged (accepted) | **unchanged**                                 | 10 of 335 definers on `search_path=public`; none without a `search_path`.                                                                                                                                                                                                                                      |
| SA-2026-07-29-11 / MYK9-125              | blocked              | **blocked**                                   | The paid premium smoke is still unevidenced (it would move money).                                                                                                                                                                                                                                             |
| SA-2026-10-31-01 / MYK9-1588             | —                    | **new**                                       | Above.                                                                                                                                                                                                                                                                                                         |

## Coverage gaps (not passes)

- **Cold-anon REST probes did not run.** The permission layer declined the `curl` GET sweep this run, and a `SET LOCAL ROLE anon` over MCP is refused (`42501`). The anon surface is proved from the catalog only (table, column and function ACLs, policy expressions). Behavioural anon results were last proved by cold probe on 2026-10-24. With no new anon grants this window, the risk of drift is low, but it is not zero.
- **Rolled-back authorization replay is still blocked over MCP** (no `SET ROLE`).
- **Live edge-function POST probes** were not run. Edge-function auth rests on static review plus the deployed-bundle inspection above.
- **Authenticated-role live probing** (exhibitor, secretary, judge, steward sessions) was not driven.
- **Behavioural SQL under `supabase/tests/`** runs only in CI and was not checked from here.
- **MYK9-125's paid premium smoke** was not run (it would move money).
- **Stripe dashboard config** for the Connect event destination is not visible from here.

## Process notes

- Two Sonnet reviewers ran: migrations, and edge functions plus client. Neither produced a false confirmed finding. Their single candidate above Info (`hard_delete_show`) was confirmed against the live catalog before filing. Every "check live" item they listed was queried; the results are in the baseline above.
- `get_advisors` output exceeded the tool limit; it was summarised by `jq` over the saved file in full (counts above).

## Linear writes

- Parent **MYK9-1587** `Security audit 2026-10-31 — P2/P3 findings`: created (`Bug`, priority Low).
- Sub-issue **MYK9-1588** (SA-2026-10-31-01): created (`Bug`, priority Low).
- Comment on **MYK9-1393** with the deployed-bundle evidence: posted. No state changes.

All three writes succeeded; nothing is unfiled.
