# Security Audit — 2026-10-24

**Mode:** Full Audit (scheduled `claude-security-audit`, unattended)
**Source:** claude
**Baseline SHA:** `3590ee292` (clean worktree from `origin/main`)
**Checklist version:** references/checklist.md @ `04be60937`
**Applied database:** staging project `sojmvhhwsjxmfistvzbe`. Read-only catalog queries and cold anonymous REST probes (GET only). No writes, no rolled-back transactions needed.
**Previous Claude report:** [`security-audit-2026-10-14.md`](security-audit-2026-10-14.md) (baseline `554046a07`)

**Linear:** see § Linear writes at the end. This run found no P0 or P1.

## Summary

| Canonical | Source severity | Count |
| --------- | --------------- | ----- |
| P0        | —               | 0     |
| P1        | —               | 0     |
| P2        | MEDIUM          | 1     |
| P3        | LOW             | 3     |
| **Total** |                 | **4** |

Lifecycle status: 4 new, 1 unchanged (SA-027, accepted risk), 1 blocked coverage carried (MYK9-125 paid smoke). All five 2026-10-14 findings re-proved resolved against the applied database (table below).

The one P2 is not a security exposure. It is a merged-but-unapplied migration behind an issue already marked Done, found while verifying the applied policy set; it is recorded here because an audit that verifies against the applied database is the check that catches it. None of the four has a mechanical auto-fix.

## Findings

### [P2 · source MEDIUM] SA-2026-10-24-01: MYK9-639's `stripe_orders_select` migration is merged and the issue is Done, but it is not applied — commented on MYK9-639

**Category:** Data Exposure (verification gap, not an exposure)
**Location:** `supabase/migrations/20261023154300_myk9_639_payment_link_order_owner_read.sql` (merged in `c8da0e6c5`, PR #3224, 2026-10-23)
**Evidence (applied DB, 2026-10-24):**

- `supabase_migrations.schema_migrations` ends at `20261022131700`; `20261023154300` is absent.
- `pg_proc` has no `my_entry_payment_link_session_ids`; a cold `rpc/my_entry_payment_link_session_ids` probe returns `PGRST202`.
- The live `stripe_orders_select` policy is still the two-arm version (own `stripe_customers` row, or `is_platform_admin()`). The link-payer arm the migration adds does not exist.
- Linear MYK9-639 moved to Done on 2026-10-23, and its 2026-10-22 reconciliation comment names this exact read as one of the two remaining readback failures.

**Risk:** None to confidentiality: the unapplied change is a widening, so its absence is the safe direction. The user-facing defect it closes (an exhibitor's My Payments omits the orders a secretary's payment link settled) is still live on staging, and `main` now carries a client that expects the new policy. Classified P2 as incomplete verification of a closed launch-scope issue.
**Static review of the migration itself (so it is not re-audited when applied):** the new SECURITY DEFINER function has `search_path=''`, `REVOKE ... FROM PUBLIC, anon`, `GRANT ... TO authenticated`; the policy arm applies only to rows with `customer_id IS NULL`; membership is decided against the link's complete `entry_payment_links.entry_ids` list, and any entry the caller cannot vouch for excludes the whole link. No concern once applied.
**Fix:** Run `supabase db push` for the migration from the linked worktree (owner action, shared-system write), then record the My Payments readback on MYK9-639. Do not reopen the issue from here: Codex owns its state moves.

### [P3 · source LOW] SA-2026-10-24-02: step-up re-auth does not cover the club payout-account onboarding or admin account deletion — MYK9-1393

**Category:** Edge Function Auth / RBAC
**Location:** `apps/myk9show/supabase/functions/stripe-connect-onboard/index.ts:89-185`, `supabase/functions/admin-delete-user`, `supabase/functions/admin-invite-user`; inventory in `docs/plan-step-up-reauth.md` § "Inventory: every gated entry point"
**Evidence:** `stepUpRefusal` is called from exactly four places: `stripe-approve-refund`, `stripe-refund-entry`, `stripe-refund-show` and `admin-generate-reset-link`. `stripe-connect-onboard` authenticates with `auth.getUser` and a caller-scoped `is_club_admin(club_id)` / `is_site_admin()`, then calls `stripe.accounts.create` and `stripe.accountLinks.create`. Whoever completes that link sets the bank account that `cron-process-payouts` later pays every one of the club's shows into (`club_stripe_accounts.stripe_account_id`). `admin-delete-user` and `admin-invite-user` are site-admin gated with no freshness check. The plan lists what is gated and what is "deliberately not gated"; none of these three appears in either list.
**Risk:** The MYK9-1208 premise (a weeks-old signed-in session on an unlocked club laptop) applies to redirecting a club's payouts at least as much as to a single refund. No authorization bypass; every function is correctly role-gated.
**Fix:** Owner decision. Either add `stepUpRefusal` after the role check in the three functions (the helper and the client replay already exist), or add them to the plan's "deliberately not gated" list with the reason.

### [P3 · source LOW] SA-2026-10-24-03: `stripe-payment-link` accepts the shared `CRON_SECRET` as a browser-reachable bypass of its role check — MYK9-1394

**Category:** Edge Function Auth
**Location:** `apps/myk9show/supabase/functions/stripe-payment-link/index.ts:21,75,143-149,216`
**Evidence:** `const cronSecret = Deno.env.get('CRON_SECRET')` is the same secret that gates `cron-waitlist-expiration`. `isInternalCall = await secretMatches(req.headers.get('x-function-secret'))` skips both the JWT check (line 149) and the secretary / club-admin / site-admin check (line 216). The comparison is constant-time and fails closed when the secret is unset. Amounts are still recomputed server-side and redirect URLs are origin-checked, so a holder of the secret can mint Checkout links for any unpaid entries but cannot change prices or destinations.
**Risk:** A leak of the waitlist-cron secret becomes a link-minting credential for every show on the platform. Defense in depth only.
**Fix:** A dedicated secret for the internal caller (the waitlist-promotion path), or route that call through the service-role client and drop the header bypass.

### [P3 · source LOW] SA-2026-10-24-04: any appointed secretary or club admin can push unbounded notices to every site admin through club creation — MYK9-1395

**Category:** RLS Policy Integrity (abuse of a definer trigger)
**Location:** live `public.notify_site_admins_club_awaiting_authorization()` (migration `20261022013700`), live policy `clubs_insert`
**Evidence:** `clubs_insert` is `is_trial_secretary() OR is_club_admin() OR is_site_admin()` with no club argument, so any active secretary or club admin of any club may INSERT clubs. The MYK9-1315 trigger is SECURITY DEFINER and inserts one `notifications` row per active site admin for every such INSERT, with the caller-supplied club name interpolated into the message. The dedupe is per club link, so N inserts produce N rows per admin. `notifications` RLS otherwise admits only self-inserts, so this trigger is the only cross-user notification path a club-level role holds.
**Risk:** In-app notification spam to the platform owner, with attacker-controlled text. No data crossing; the admin inbox is the asset. Pre-launch, every secretary is known; the risk grows with each independent club.
**Fix:** Rate-limit the trigger per creator (for example, skip when the same `auth.uid()` created a club awaiting authorization in the last hour), or fold repeated notices into one row per creator per day. The unscoped `clubs_insert` itself is an owner decision recorded on MYK9-572.

## Observations (not filed)

- **Stripe Connect events still pass through the platform event switch** (`webhookHandler.ts:40-50`, carried from 2026-10-14). No exploit path: Express accounts cannot mint sessions; every handler keys on platform rows. The one-line guard (`event.account` set and type not `account.*` → log and return) is still cheap.
- **Demo fixture contradicts the authorization gate.** `Heartland Scent Work Club` (`is_demo`) has `authorized_at IS NULL` and 9 published shows, so it appears in the public club directory through `club_has_public_show()`, and its registry numbers are anon-readable through the new `club_registry_numbers_select` policy. The publish trigger `enforce_show_club_authorization` is API-roles-only, so the seed (service_role) bypassed it. Fixture hygiene, not a gate failure: a cold-anon INSERT path to a published show on an unauthorized club does not exist. Worth one line in the seed to authorize the demo club.
- **`admin-generate-reset-link` logs the target email** (`generateResetLinkHandler.ts:79`). Only PII-in-log hit across both edge trees. The link itself is not logged.
- **Non-refund Stripe functions echo `error.message` to the browser** (`stripe-checkout:251`, `stripe-payment-link:568`, portal, connect-onboard, upgrade) while the refund functions deliberately mask (MP-20). Inconsistent, not exploitable.
- **`LoggingService` posts unredacted context to `VITE_LOG_ENDPOINT`** when set (`LoggingService.ts:186`); `packages/core/src/utils/redaction.ts` is not applied there. The endpoint is unset in every environment today.
- **`/secretary/pipeline/:trialId` moved from role-guarded to a bare redirect** (`secretaryRoutes.tsx:254`). The trial read runs under RLS and resolves only to a public `/shows/:id`; not an oracle beyond what `/shows/:id` already answers.
- **`shows(*)` on both anon show reads** re-expands with every new `shows` column (`reads.postgrest.ts:47,286`). The column grants on `shows` are table-level `anon=r`, so a future sensitive column lands on the public page by default. Same pattern the `SELECT e.*` view lesson covers.
- **Cross-trial Change class (MYK9-1265) is money-neutral by documented design** and the dialog says nothing about a fee delta. Business gap, secretary-only, server re-authorizes.
- **20 PUBLIC-executable functions** are all trigger functions or pure normalizers (`normalize_*`, `_result_*`); PostgREST does not expose `RETURNS trigger` functions (probe: `PGRST202`). Hygiene only.
- **Advisor:** 120 `auth_allow_anonymous_sign_ins` warnings (passcode ringside sessions, deliberate), 1 `security_definer_view` error (the two owner-run result views, MYK9-472), 1 anon- and 1 authenticated-executable definer-function warning (the documented keep-list), 14 `rls_enabled_no_policy` infos (deny-by-default tables).
- **Labels:** `p0`/`p1`, `source:claude`, `audit:security` still do not exist in the workspace (fifth run). Issues use `Claude` + `Bug` plus the priority field.

## Rejected / not re-raised

- `judge_qualifications_insert/update` on unscoped `has_role('secretary')`: owner decision MYK9-354, pinned by `judge_qualification_rpc_authorization_test.sql`.
- `dog_registrations_insert` keeping `OR has_role('secretary')`: deliberate fill-a-gap arm, MYK9-1155 header and test.
- `create_dog_with_registrations` privileged arm unscoped (any secretary creates a dog for any owner): mail-in entry workflow, MYK9-1127 / "secretaries see all dogs" owner decisions.
- `registry_identity_taken`, `entry_awaiting_registration_number`, `dog_has_account_holder` as boolean oracles: documented intent in each COMMENT.
- `review_club_access_request` "PUBLIC EXECUTE" from migration text: live `proacl` is `{postgres, service_role, authenticated}` (same refutation as 2026-10-14's F4).
- Earlier rejections still hold: admin routes unguarded; `send-results` app_metadata comment; people column grants (MYK9-473); clubs email/phone; premium-published UUID regex; `is_show_secretary` `show_id IS NULL`.

## Categories Checked

| Category                    | Examined                                                                                                                                                                                                                                                             | Findings   | Skipped                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------- |
| RLS Policy Integrity        | 142 public tables live; all 25 migrations since `554046a07` read in full (6,229 lines); live policies, relacl, attacl, reloptions, triggers on the touched tables                                                                                                    | 1 (04)     | —                               |
| Edge Function Auth          | 49 functions in 2 trees (36 + 13), 48 deployed, all `verify_jwt=false` by design; every file changed since baseline read in full; per-function gate table re-verified                                                                                                | 2 (02, 03) | live POST probes (see Coverage) |
| RBAC & Privilege Escalation | `require_recent_reauth` + 3 triggers, `set_club_authorization`, `guard_club_authorization_write`, `authorize_club_created_by_site_admin`, `move_up_entry`, `get_show_entry_counts`, `can_manage_show` / `is_show_official` role sets; 328 SECURITY DEFINER functions | 0          | —                               |
| Client Auth Patterns        | every route changed since baseline; `ProtectedRoute` / `adminGuard`; MYK9-1208 client replay; dev gating; storage; `returnTo` handling                                                                                                                               | 0          | —                               |
| Data Exposure               | cold-anon REST on 30 tables/views + 6 RPCs; anon embed inventory for `/shows`, `/shows/:id`, `/clubs`, `/tv`; column grants on `classes`, `dogs`, `people`, `judge_assignments`, `platform_settings`                                                                 | 1 (01)     | —                               |
| Payment Security            | stripe-checkout / webhook / refund-entry / refund-show / approve-refund / payment-link / connect-onboard / customer-portal / upgrade-subscription / cron-process-payouts                                                                                             | 0          | paid smoke                      |
| Input Validation            | `dangerouslySetInnerHTML` (2 sites, both DOMPurify), no `innerHTML`/`eval`/`new Function`, all `window.location` targets literal or edge-function URLs, `.or()` filters escaped, anon route params parameterized                                                     | 0          | —                               |

## Verified-good baseline (applied DB, 2026-10-24)

- **RLS:** enabled and forced on all **142** public tables (141 last run; `club_registry_numbers` is the addition). 12 zero-policy deny-by-default tables, same set as 2026-10-14 (`show_lifecycle_email_job_requests` has an explicit deny-all policy instead).
- **Anon table grants:** 19 relations, all `r` except `platform_waitlist=a`. New since last run: `club_registry_numbers` (`anon=r`, policy defers to `clubs_select`, RATIONALE in the migration header). Cold-anon `platform_waitlist` SELECT still 401.
- **Anon column grants:** `classes`, `dogs`, `judge_assignments`, `people`, `platform_settings` only. `classes.has_blank`, `hides_known`, `judge_signed_off_*`, `results_verified_*` have no anon grant (probes 401). `entries` has none (401).
- **Cold-anon REST probes (GET):**
  - Empty: `people`, `dogs`, draft `shows`.
  - 401: `entries`, `user_roles`, `notifications`, `stripe_orders`, `entry_payment_links`, `people_private`, `show_lifecycle_email_jobs/steps`, `club_access_requests`, `refund_requests`, `show_payments`, `show_passcodes`, `operator_alerts`, `trial_packet_snapshots`, `calendar_feed_tokens`, `judge_day_summary`; `rpc/get_show_entry_counts` 42501.
  - `judge_assignments` rows only from published shows, `person` embed `null`; `armbands` only from published shows (MYK9-469 holds).
  - `view_public_entry_results` returns public-show rows only; `rpc/get_show_officials` for an unknown show returns `[]`; `rpc/is_site_admin` returns `false`.
- **Sequences:** 4; only `registration_confirmation_seq` granted (`authenticated=rU`).
- **Views:** 12, none auto-updatable. The three rebuilt by MYK9-1326 kept their inline `security_invoker` (`false` on the two result views with `authenticated=r` only; `true` on `view_entry_with_results`); no anon entry except `view_public_entry_results`.
- **SECURITY DEFINER functions:** 328 (319 last run), all with an explicit `search_path`, 11 on `search_path=public` (unchanged, SA-027). 17 anon-executable definers, the same keep-list as before; `get_show_class_hide_counts` returns nothing to a session with no manager, steward, judge or passcode claim.
- **Default privileges:** the `postgres`-grantor rows for `public` (tables, sequences, functions) grant only `postgres` and `service_role`; the `supabase_admin` rows still name `anon`. Every table created in this window has no anon entry unless granted explicitly. Keep writing the `REVOKE`.
- **Step-up re-auth (MYK9-1208):** `require_recent_reauth` reads `amr` from the signed JWT, exempts only a NULL JWT and `service_role`, window 300 s, skew 60 s; the two edge copies of `stepUpReauth.ts` are byte-identical and read the header `auth.getUser` already verified. AFTER triggers on `user_roles`, `roles`, `role_permissions` fire only for API roles. `grant_club_secretary`, `revoke_club_secretary`, `approve_role_request`, `review_club_access_request` all contain the call live.
- **Club authorization (MYK9-1310 / 1315):** `guard_club_authorization_write` nulls `authorized_at/by` on any API-role INSERT and refuses any API-role change; the only write path is `set_club_authorization` (site-admin check, row lock, audit row, transaction-local GUC); the auto-authorize trigger acts only when `is_site_admin()`. The client `toSupabaseRow` allowlist never emits the columns.
- **Cross-trial Change class (MYK9-1265):** `move_up_entry` restates `can_manage_show(source.show_id)`, refuses a target in another show, a complete or cancelled class, and any started run; judges, stewards and exhibitors get 42501.
- **Lifecycle email (MYK9-1212 / 1254):** authenticated UPDATE on `show_lifecycle_email_jobs` is column-scoped to `status, subject, body, secretary_note, skipped_at`; lease and bookkeeping columns are service-role only; the claim and finish RPCs are service-role only and restate the entry's show scope.
- **Edge functions** (static, every file changed since baseline read in full; deployed versions listed): all 49 gate themselves; every secret comparison is constant-time; no role check reads `app_metadata`; no `VITE_` Stripe secret; `refunds.create` appears only at the three human-action sites; the webhook uses the raw body with `constructEventAsync` and 400s on a bad signature; payout destination from `club_stripe_accounts` filtered to the running livemode.

## Previous Audit Comparison (vs 2026-10-14)

| ID                           | Then                      | Now                 | Proof this run                                                                                                                                |
| ---------------------------- | ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SA-2026-10-14-01 / MYK9-1155 | new (remediated same day) | **resolved, holds** | Live `dog_registrations_update/_delete` carry no `has_role('secretary')` arm; only `_insert` keeps it, by documented intent.                  |
| SA-2026-10-14-02 / MYK9-1156 | new (remediated)          | **resolved, holds** | `askq/toolExecutor.ts` routes class-summary counts through the caller client; `ask-myk9show` deployed at v74 (fix shipped as v68).            |
| SA-2026-10-14-03 / MYK9-1157 | canceled (my error)       | canceled            | Not re-raised.                                                                                                                                |
| SA-2026-10-14-04 / MYK9-1158 | new (remediated)          | **resolved, holds** | `trg_00_guard_owner_change` BEFORE UPDATE OF owner_id/co_owner_id is live on `dogs`; `can_change_dog_owner` is INVOKER with `search_path=''`. |
| SA-2026-10-14-05 / MYK9-1159 | new (remediated)          | **resolved, holds** | `trg_00_block_direct_judge_sign_off_write` and `_insert` are live on `classes`; `ringside_update_class` field allow-list excludes sign-off.   |
| SA-027 / MYK9-151            | unchanged (accepted)      | **unchanged**       | 11 of 328 definer functions on `search_path=public`; 0 without one.                                                                           |
| SA-2026-07-29-11 / MYK9-125  | blocked                   | **blocked**         | Paid premium smoke still unevidenced.                                                                                                         |
| SA-2026-10-24-01..04         | —                         | **new**             | Above.                                                                                                                                        |

## Coverage gaps (not passes)

- **Rolled-back authz replay** still blocked over MCP (no `SET ROLE authenticated`, no EXECUTE on the role predicates). All four findings are mechanism findings from the applied catalog and source; none needed a replay to confirm.
- **Live edge-function POST probes** not run (permission layer declines cold POSTs to money endpoints). Edge-function auth is static plus the deployed-version listing; bundles were not re-extracted.
- **Authenticated-role live probing** (exhibitor, secretary, judge sessions) not driven.
- **Behavioural SQL under `supabase/tests/`** runs only in CI. Objects in this window with no test naming them directly: `notify_site_admins_club_awaiting_authorization`, `dogs_guard_owner_change` (behaviour covered indirectly), `copy_request_club_numbers_on_approval` (covered indirectly).
- **GoTrue `amr` carry-over across refresh** is a runtime property the step-up design relies on; if it did not hold, the gate would fail closed (re-prompt), never open.
- **Stripe dashboard config** of the Connect event destination (which event types it sends) is not visible from here.
- **MYK9-125's paid premium smoke** not run (would move money).

## Process notes

- **Sub-agent precision:** three lenses, zero false confirmed findings; every candidate was raised as an observation with its evidence, and each live check they asked for was run (view reloptions, new-table ACLs, `review_club_access_request` proacl).
- **The P2 is a deploy-state finding.** Verifying against the applied database, not the migration text, is what surfaced it; a migration-text review would have passed MYK9-639 as closed.
- **Labels:** fifth run without `p0`/`p1`, `source:claude`, `audit:security` labels. Either mint them or edit `docs/operations/scheduled-audits-claude.md`.

## Linear writes

- Comment on **MYK9-639** (SA-01): posted.
- Parent **MYK9-1392** `Security audit 2026-10-24 — P2/P3 findings` with sub-issues **MYK9-1393** (SA-02), **MYK9-1394** (SA-03), **MYK9-1395** (SA-04): created, `Claude` + `Bug`, priority Low.

All five writes succeeded; nothing is unfiled.
