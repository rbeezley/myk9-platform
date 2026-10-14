# Security Audit — 2026-10-14

**Mode:** Full Audit (scheduled `claude-security-audit`, unattended)
**Source:** claude
**Baseline SHA:** `554046a07` (clean worktree from `origin/main`)
**Checklist version:** references/checklist.md @ `04be60937`
**Applied database:** staging project `sojmvhhwsjxmfistvzbe`. Read-only catalog queries and cold anonymous REST probes.
**Previous Claude report:** [`security-audit-2026-09-12.md`](security-audit-2026-09-12.md) (baseline `d4cb4941c`)

**Linear:** all writes succeeded and nothing is unfiled. Parent **MYK9-1154** has sub-issues **MYK9-1155..1159**. This run found no P0 or P1.

## Summary

| Canonical | Source severity | Count |
| --------- | --------------- | ----- |
| P0        | —               | 0     |
| P1        | —               | 0     |
| P2        | HIGH, MEDIUM    | 2     |
| P3        | LOW             | 3     |
| **Total** |                 | **5** |

Lifecycle status: 5 new, 1 unchanged (SA-027, accepted risk), 1 blocked coverage carried (MYK9-125 paid smoke), 1 rejected (agent candidate F4). The five 2026-09-12 findings stay resolved (re-proved below).

None of the five findings has a mechanical auto-fix. Each needs a decision about who may write, and this run is audit-only.

## Findings

### [P2 · source HIGH] SA-2026-10-14-01: `dog_registrations` write policies admit any secretary for any dog — MYK9-1155

**Category:** RBAC & Privilege Escalation
**Location:** live policies `dog_registrations_insert` / `_update` / `_delete`, restated in `supabase/migrations/20261003002747_myk9_941_dog_registrations_co_owner_writes.sql:32-66`
**Evidence:** All three policies end with `OR (SELECT has_role('secretary'))`. `has_role(role_name, scope_club_id DEFAULT NULL)` with no club argument matches any active secretary role in any club. Table relacl is `authenticated=arwd`. The applied DB holds 81 registration rows and 7 active club-scoped secretaries. There are 150 (secretary, registration) pairs where all of these hold:

- the dog's owner is another account holder;
- the dog has no entry at any show of that secretary's club;
- the secretary did not create the dog, and it did not come from her show.

Every one of those pairs passes the write predicate and fails `dog_edit_allowed()`.
**Risk:** A secretary of any club can add, change or delete any exhibitor's AKC/UKC/ASCA registration rows platform-wide. These are the identity data printed on entries and submitted to the registry.
**Intent check:** The arm came from ledger-only migration 154 (MYK9-961) and was restated by MYK9-941, which pins "a secretary still may". No source scopes it. `20261012224900` (MYK9-1127) then stated the opposite rule for the dog itself: "An exhibitor-owned dog with no tie to the secretary's shows stays read-only to her". "Secretaries see all dogs" is a read rule.
**Fix:** Gate the three write policies on `dog_edit_allowed(...)` of the parent dog, and extend the MYK9-941 behavioural test with a cross-club refusal.
**Why P2:** The attacker needs an appointed secretary role, the arm is test-pinned, and the platform is pre-launch. Treat it as launch-blocking if more than one independent club goes live first.
**Proof gap:** A rolled-back write replay was blocked (see Coverage), so this is a mechanism finding from the applied catalog.

### [P2 · source MEDIUM] SA-2026-10-14-02: AskQ `get_class_summary` bypasses the results release cascade and results privacy — MYK9-1156

**Category:** Data Exposure
**Location:** `supabase/functions/_shared/askq/classAndTrialTools.ts:189-226`, called from `toolExecutor.ts` `case 'get_class_summary'` with the service-role client. Show context is set in `supabase/functions/ask-myk9show/index.ts:261-285`.
**Evidence:** The tool reads `entries.result_status` with the service role and returns per-class `qualified_count` / `nq_count`. On the applied DB, `authenticated` has no table or column SELECT on `entries`. Its only read path is `view_authenticated_entry_results`, which nulls `result_status` unless both:

- the release cascade sets `qualification_visible`;
- the entry is not privacy-masked (club `results_private`, or any tied person without `results_public`).

Show context is granted to any signed-in, non-anonymous user with any entry at the show, including withdrawn and soft-deleted entries.
**Risk:** An exhibitor at the show learns Q/NQ totals per class before release, including for dogs whose owners opted out. In small classes those totals reveal individual outcomes. This is the aggregate sibling of the leak MYK9-969 closed.
**Fix:** Count from `resultsClient` against the view, or null the counts until the caller can see the results. Tighten the show-context entry check.

### [P3 · source LOW] SA-2026-10-14-03: `fill_entry_owner_address` fills any dog owner's blank address, cross-club — MYK9-1157

**Category:** RBAC & Privilege Escalation
**Location:** `supabase/migrations/20261008213900_myk9_1010_fill_entry_owner_address.sql:60-100` (applied body confirmed). EXECUTE is granted to `authenticated` only.
**Evidence:** The only authorization is `can_manage_show(p_show_id)`. The owner is then resolved from `p_dog_id` alone, with no tie to the show, and there is no `auth_user_id IS NULL` guard on the person written.
**Risk:** A manager of any live show can set an account holder's blank address fields anywhere on the platform. Reading the address adds nothing new: `people_select` already admits any secretary through `can_read_dog_directory()`.
**Fix:** Require the dog to be tied to `p_show_id`, and require `person_edit_allowed()` for the owner.

### [P3 · source LOW] SA-2026-10-14-04: `dog_edit_allowed` creator and show arms outlive the owner's account and allow re-owning — MYK9-1158

**Category:** RBAC & Privilege Escalation
**Location:** `supabase/migrations/20261012224900_dogs_update_secretary_created_dogs.sql:46-62` (applied body confirmed)
**Evidence:** `person_edit_allowed()` applies its creator and show arms only while `auth_user_id IS NULL`. The dog version has no equivalent cut-off, and its `created_by` arm accepts a staff role in any club. No trigger freezes `owner_id` or `co_owner_id`.
**Risk:** The secretary who created a dog, and every manager of its origin show, can edit and re-own it permanently, even after the exhibitor has claimed an account. The increment over `can_manage_show_dog()` is small.
**Fix:** Owner decision: mirror the people rule, or accept the reach and document it.

### [P3 · source LOW] SA-2026-10-14-05: `classes.judge_signed_off_*` has no direct-write guard — MYK9-1159

**Category:** RLS Policy Integrity
**Location:** `supabase/migrations/20261006154700_myk9_1030_judge_sign_off.sql:51-53`
**Evidence:** `has_column_privilege('authenticated','classes','judge_signed_off_by','UPDATE')` is true, and `classes_update` is `can_manage_trial(trial_id)`. The live `classes` triggers include `trg_00_block_direct_results_verified_*` but have no sign-off equivalent.
**Risk:** A manager can stamp any user id or time as the judge's sign-off, bypassing the RPC rules. Judges and stewards cannot reach it.
**Fix:** Add a direct-write guard trigger mirroring the results-verified one.

## Observations (not filed)

- **Stripe Connect events (speculative, defense in depth).** `stripe-webhook` sends a Connect-signed event that carries `event.account` to the platform handlers without checking `event.account == null`. Connected accounts are Express, so they cannot create Checkout Sessions on the platform. Fulfilment also requires `cart.stripe_checkout_session_id === session.id`. No exploit path was found. A cheap hardening would be to accept Connect-signed events only for `account.*` types.
- **Advisor:** 120 `auth_allow_anonymous_sign_ins` warnings. These are expected, because passcode ringside sessions are anonymous sign-ins and the policies admit them deliberately. One `security_definer_view` error covers the three `security_invoker=false` result views, which are owner-run by design (MYK9-472).

## Rejected

- **F4: "`review_club_access_request` is EXECUTE-able by PUBLIC".** The live `proacl` is `{postgres, service_role, authenticated}` with no `=X/` entry, and the body opens with an `is_site_admin()` check. The agent read the migration text without checking the applied ACL.
- **Earlier rejections still hold:** admin routes unguarded; `send-results` app_metadata; people column grants (MYK9-473); clubs email/phone; premium-published UUID regex; `is_show_secretary` `show_id IS NULL`.

## Categories Checked

| Category                    | Examined                                                                                                                                                 | Findings          | Skipped                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------- |
| RLS Policy Integrity        | 141 public tables live; 130 migrations since 2026-09-12 (all since 10-07 read in full)                                                                   | 1 (05)            | —                            |
| Edge Function Auth          | 49 functions in 2 trees, 48 deployed (`verify_jwt=false` on all, by design)                                                                              | 0                 | live POST probes (see below) |
| RBAC & Privilege Escalation | `has_role`, `dog_edit_allowed`, `person_edit_allowed`, `guard_creation_attribution`, ringside / sign-off / verify RPCs; 319 SECURITY DEFINER functions   | 3 (01, 03, 04)    | —                            |
| Client Auth Patterns        | route changes since 09-12, `anonymousAccessBoundary.ts` allowlist, `/prototype/show` gated on `import.meta.env.DEV`                                      | 0                 | —                            |
| Data Exposure               | cold-anon REST on 30 tables/views, AskQ tools, `view_authenticated_entry_results`                                                                        | 1 (02)            | —                            |
| Payment Security            | stripe-checkout / webhook / refund-entry / refund-show / approve-refund / payment-link / cron-process-payouts                                            | 0 (1 observation) | paid smoke                   |
| Input Validation            | `dangerouslySetInnerHTML` (2 sites, both through `sanitizeHTML`), `returnTo`/`redirectTo` handling (origin-checked), no `eval`/`innerHTML` in app source | 0                 | —                            |

## Verified-good baseline (applied DB, 2026-10-14)

- **RLS:** enabled and forced on all **141** public tables. The 2026-09-12 count of 203 was taken differently, and no public table lacks RLS today.
  - 12 tables have zero policies and are deny-by-default: the 8 from last run, plus `cart_fulfillments`, `cart_fulfillment_lines`, `cart_spot_holds` and `cart_checkout_leases` (all `service_role` only; cold anon gets 401).
- **Anon table grants:** 18 tables, all `r` except `platform_waitlist=a`. Cold-anon SELECT on `platform_waitlist` returns 401.
- **Anon column grants:** `classes`, `dogs`, `judge_assignments`, `people`, `platform_settings`. `entries` has dropped off the list since 09-12, and cold-anon `entries` returns 401.
- **Cold-anon REST probes:**
  - Empty: `people`, `dogs`, `achievements`, `show_templates`.
  - 401: `entries`, `user_roles`, `show_passcodes`, `refund_requests`, `entry_carts`, `show_payments`, `dog_registrations`, `judge_day_summary`, `view_authenticated_entry_results`, all cart tables.
  - `judge_assignments` and `armbands` rows come only from the 3 published, undeleted shows. Draft shows are not visible, so MYK9-469 still holds.
  - `view_public_entry_results` returns 3 rows from one published show. Its columns carry no PII beyond the handler name shown on public results.
- **Sequences:** 4. Only `registration_confirmation_seq` is granted (`authenticated=rU`).
- **Views:** 12, none auto-updatable. The 3 owner-run result views carry `authenticated=r` only (MYK9-472 holds). The new `judge_day_summary` is `security_invoker=true`.
- **SECURITY DEFINER functions:** 319, all with an explicit `search_path`, of which 11 use `search_path=public` (down from 20). The 17 anon-executable ones are the keep-list (public read helpers and role predicates), and none is reached through PUBLIC.
- **New ringside and paperwork RPCs:**
  - `ringside_update_class` derives the show and club from the class. It admits a manager, the judge assigned to that exact class, or a passcode claim for the same show with the generation check. Stewards are refused, and the fields are allowlisted.
  - `mark_class_results_verified` and `clear_class_judge_sign_off` use `can_manage_trial`, so judges and stewards are excluded.
- **Creation attribution:** `private.guard_creation_attribution` stamps `created_by := auth.uid()`, drops an unmanageable `created_from_show_id` on INSERT, and freezes both columns on UPDATE. Attribution cannot be forged to gain access.
- **Edge functions** (static review):
  - All 49 gate themselves: 13 through the wrapper with `auth:'jwt'` (`auth.getUser`), 15 with `auth:'none'` plus a secret or HMAC gate that returns 503 when the secret is unset, and 21 hand-rolled, each read and gated.
  - The 4 new functions are gated: `stripe-approve-refund` (site admin, as the caller), `withdraw-waitlist-offer` (`canManageShow` from the DB row), `send-access-request-emails` (function secret), and `get-premium-download` (public only for published shows; drafts need a manager).
  - Every secret comparison is constant-time.
- **Stripe** (static review):
  - The webhook uses the raw body with `constructEventAsync`, returns 400 on a bad signature, and throws at load when the secret is unset.
  - Line prices are recomputed server-side, and `VALID_PRICE_IDS` is an allowlist.
  - `refunds.create` appears only at three human-action sites (secretary dialog, cancelled-show manager refund, site-admin approval).
  - The payout transfer destination comes from `club_stripe_accounts`.
  - No `VITE_*` Stripe secret exists.

## Previous Audit Comparison (vs 2026-09-12)

| ID                          | Then                 | Now                      | Proof this run                                                                                                                                                                                              |
| --------------------------- | -------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SA-2026-09-12-01 / MYK9-469 | resolved             | **resolved, holds**      | Cold-anon `judge_assignments` and `armbands` show_ids are all `published`, with no draft rows.                                                                                                              |
| SA-2026-09-12-02 / MYK9-470 | resolved             | **resolved, holds**      | `vaccinations_select` is scoped through dog ownership with a soft-delete gate. `offline_scoring`/`volunteer_roles` use `is_real_account()`. `result_submissions` uses `entry_enrollment_select_show_ids()`. |
| SA-2026-09-12-03 / MYK9-471 | resolved             | **resolved, holds**      | Static: `send-push-notification` service-key compare is timing-safe. Deployed bundle not re-extracted this run.                                                                                             |
| SA-2026-09-12-04 / MYK9-472 | resolved             | **resolved, holds**      | `view_public_entry_results` relacl is `authenticated=r`, `anon=r`.                                                                                                                                          |
| SA-2026-09-12-05 / MYK9-473 | rejected             | rejected                 | —                                                                                                                                                                                                           |
| SA-027 / MYK9-151           | unchanged (accepted) | **unchanged, improving** | 11 SECURITY DEFINER functions on `search_path=public` (was 20). 0 lack an explicit `search_path`. MYK9-151 Done as accepted risk.                                                                           |
| SA-2026-07-29-11 / MYK9-125 | blocked              | **blocked** (issue Done) | The authz half holds (static). The paid smoke and account-wide budget are still unevidenced.                                                                                                                |
| SA-2026-10-14-01..05        | —                    | **new**                  | Above.                                                                                                                                                                                                      |

## Coverage gaps (not passes)

- **Rolled-back authz replay blocked.** The Supabase MCP role cannot `SET ROLE authenticated` (42501) and has no EXECUTE on `has_role` / `get_my_person_id`, so neither a write replay nor a predicate replay under a forged JWT claim could run. SA-01, 03, 04 and 05 are mechanism findings from the applied catalog. To close this, a `psql --db-url` session in a rolled-back transaction (see `reference_db_push_and_verify`) could run them.
- **Live edge-function probes declined.** The permission layer refused cold-anon POSTs to the function endpoints. Edge-function auth is static-review only this run, and the deployed bundles were not re-extracted.
- **Authenticated-role live probing** (exhibitor, secretary, judge sessions) was not driven, including the AskQ exploit path for SA-02.
- **Behavioural SQL under `supabase/tests/`** runs only in CI.
- **MYK9-125's paid premium smoke** was not run, because it would move money.
- **Whether the `supabase_admin` default-privilege row fires for a dashboard-created table** is unproven: proving it needs a `CREATE TABLE`.

## Process notes

- **Labels:** the prompt's `p0`/`p1`, `source:claude` and `audit:security` labels still do not exist in the workspace (fourth run). Issues use `Claude` + `Bug` plus the priority field (Medium = P2, Low = P3). Either mint the labels or edit `docs/operations/scheduled-audits-claude.md`.
- **Agent precision:** both review agents reported accurately on mechanism. One candidate (F4) was refuted by reading the applied ACL rather than the migration text. One premise (that the AskQ counts might already be readable) was refuted live: authenticated has no `entries` SELECT.
