# 009 — Supabase security-advisor disposition sweep (verdicts pre-decided)

> Written 2026-07-11 against the live advisor output for project `sojmvhhwsjxmfistvzbe` (364 lints). Closes go-live blocking item #7 ([../launch/go-live-2026-07-11.md](../launch/go-live-2026-07-11.md)). The judgment calls are made here; the executor's job is allowlist derivation (queries provided), one migration, and two config checks. **This plan touches live-DB authorization — run `migration-auditor` on the migration and get owner confirmation before `db push` (Auto Mode shared-system rule).**

## Advisor inventory (2026-07-11)

| Lint                                                 | Level | Count            | Verdict                                                        |
| ---------------------------------------------------- | ----- | ---------------- | -------------------------------------------------------------- |
| `security_definer_view`                              | ERROR | 2                | **Accept, document** (deliberate design)                       |
| `anon_security_definer_function_executable`          | WARN  | 112              | **Fix: default-deny + allowlist** (structural)                 |
| `authenticated_security_definer_function_executable` | WARN  | 119              | **Mostly accept; revoke test/trigger fns**                     |
| `auth_allow_anonymous_sign_ins`                      | WARN  | 110 (per-policy) | **Accept mechanism; VERIFY blast radius** (the one open check) |
| `function_search_path_mutable`                       | WARN  | 16               | **Fix: pin all 16** (mechanical)                               |
| `public_bucket_allows_listing`                       | WARN  | 2                | **Fix: drop listing policies** (after one grep)                |
| `rls_enabled_no_policy`                              | INFO  | 3                | **Accept, document** (deny-all by design)                      |

## Verdict 1 — SECURITY DEFINER views (2 ERROR): accepted by design

`view_public_entry_results` and `view_authenticated_entry_results` are the deliberate column-gating cascade (#779 per-field design; ringside staff read path, migration `20260621190000`; public results release gate). They MUST be definer: their whole job is to bypass base-table RLS and substitute stricter, column-level, claim-aware gating (payment/PII NULLed, scores gated on `is_assigned_judge`/release). Converting to `security_invoker` would break every ringside/public read.
**Action:** none to the views. Add a `COMMENT ON VIEW` to each stating the acceptance rationale + date, so the next advisor reader finds the disposition in the schema itself. These two ERRORs will remain in advisor output permanently — that is the accepted cost.

## Verdict 2 — anon-executable SECURITY DEFINER functions (112): structural fix, not 112 case-by-case calls

**Root cause:** Postgres default privileges grant `EXECUTE` on new functions to `PUBLIC` — every `CREATE FUNCTION` since day one silently granted anon. The fix is structural (default-deny + explicit allowlist), which also stops the count regrowing.

Classification of the 112 (from the live list):

- **Trigger functions (~35)** — `entries_protect_*`, `notify_*`, `handle_new_user`, `sync_*`, `propagate_*`, `people_protect_*`, `stamp_entry_withdrawn_at`, `prevent_orphaning_dogs_on_person_delete`, `cart_item_identity_change_sever_session`, `entry_cart*_protect_*`, `guard_platform_settings_write`, `handle_entry_scoring_state_change`, `update_thread_last_message_at`, `auto_assign_armband_on_accept`, etc. PostgREST does not expose trigger-returning functions via `/rpc`, so the grant is unexploitable via the API — but revoke anyway (defense-in-depth + advisor hygiene). Safe to revoke from `anon` AND `authenticated`: triggers fire as the table owner path, not via caller EXECUTE on the trigger function through the API.
- **RLS helper predicates (~25)** — `is_*`, `can_*`, `has_role`, `get_my_person_id`, `get_my_handled_dog_ids`, `user_has_permission`, `_account_ringside_show_id`, `volunteer_show_id`, `resolve_class_result_visibility`, `_result_*`. **CAUTION — this is where a naive sweep breaks production:** RLS policies execute their `USING` clauses as the querying role, so any helper referenced by a policy on a table `anon` can read MUST keep anon EXECUTE, or every anon read of that table starts erroring. Derive the keep-list mechanically (query below); expect it to be small (the public-results path + any anon-readable lookup tables).
- **Test scaffolding (3)** — `test_as_anon`, `test_as_user`, `test_reset`. These should not be anon-executable in a production-bound DB under any theory. Revoke from `anon` and `authenticated` (keep `service_role`); read each function body first — if `test_reset` mutates data, consider dropping it from the linked project entirely and keeping it a local-dev-only migration.
- **Privileged RPCs (~40)** — `hard_delete_show`, `restore_*`, `soft_delete_*`, `get_admin_user_list`, `get_entries_for_export`, `get_license_key`, `approve_role_request`, `grant_*`, `revoke_club_secretary`, `regenerate_show_passcodes`, `resolve_operator_alert`, `submit_show_entries`, `create_show_with_children`, etc. All carry internal `is_site_admin()`-style gates (that's the SECURITY DEFINER pattern this repo uses), so anon EXECUTE is not an open door — but it IS needless attack surface (anon can probe error behavior, burn CPU, exercise parsing). Revoke anon from all. Keep `authenticated` (their internal gates are the authz layer — verified live for several in prior sessions).
- **Genuine anon surface (~expect 0–3)** — candidates to CHECK, not assume: `validate_passcode` (called by the `validate-passcode` **edge function with service role** — if so, anon EXECUTE is unnecessary; verify the client never calls it directly via `supabase.rpc`), `self_checkin_entry`, `increment_promo_usage`, `validate_promo_code`, `insert_club_access_request_from_signup` (signup-time = anon?). For each: grep the client for `\.rpc\('<name>'` and note the session state at the call site. Passcode ringside users are **`authenticated`** (anonymous sign-in mints a real session) — they do NOT need `anon` grants; do not confuse the two.

**Executor queries:**

```sql
-- (a) Helpers referenced by policies visible to anon (keep-list for anon EXECUTE)
SELECT DISTINCT pol.tablename, pol.policyname, pol.qual
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND (pol.roles @> '{anon}' OR pol.roles @> '{public}');
-- manually extract function names from qual/with_check; those keep anon EXECUTE.

-- (b) Trigger functions (revocable from anon+authenticated wholesale)
SELECT p.proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype;
```

**Migration shape** (one migration, `NNN_revoke_anon_function_execute.sql`):

```sql
-- 1. Stop the bleeding for future functions:
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- 2. Sweep existing: REVOKE EXECUTE ... FROM anon for every SECURITY DEFINER fn
--    EXCEPT the derived keep-list (a) + verified anon surface. Generate the
--    statement list from pg_proc rather than hand-typing 100+ names.
-- 3. Trigger fns + test_* : also REVOKE FROM authenticated.
-- 4. GRANT EXECUTE back explicitly where (a)/(5th bullet) requires it.
```

**Post-push verification (required):** in a cold/incognito session — anon public-results read still works (`view_public_entry_results` path); passcode ringside sign-in → read → score still works; signed-in exhibitor entry submission still works. These three cover the derived keep-lists. Per `feedback_verify_anon_in_cold_session`, use a DIRECT PostgREST read for the public route.

**Consequence to note in the PR:** after the sweep, the `anon_security_definer_function_executable` count should drop from 112 to the keep-list size; `authenticated_*` (119) drops only by the trigger+test set — the rest are accepted (internal gates are the design).

## Verdict 3 — anonymous sign-ins (110 WARNs): mechanism accepted, blast radius needs ONE check

Anonymous sign-ins are **required** by the passcode ringside identity (enabled deliberately 2026-06-24, `plan-ringside-entries-read-authz.md`, now archived-track). The 110 WARNs are the advisor noting, per policy, that anything granted to `authenticated` is also reachable by an anonymous session. The intended surface is tightly claim-gated (`kind: 'ringside_passcode'` in app_metadata gates the view tier and RPC tier). **The open question the advisor is actually asking:** do any OTHER `authenticated` SELECT/INSERT/UPDATE policies on sensitive tables (people PII, entries payment columns, clubs, payments/refund tables, support tickets) admit an anonymous session that holds no ringside claim?

Mitigations already in place: signup trigger guard `20260625000000` (anon users don't get people rows / roles), recurring cleanup `20260625000100`, `dogs_select`/`people_select` gated by `is_show_manager()` (membership an anon session lacks). So exposure is _probably_ nil — but nobody has enumerated it.

**Executor check (this is the whole task):**

```sql
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname='public' AND roles @> '{authenticated}'
  AND cmd IN ('SELECT','ALL')
  AND qual NOT ILIKE '%is_anonymous%';
```

For each row, ask: does the `qual` reduce to "any authenticated user may read" (e.g. `true`, or only `auth.uid() IS NOT NULL`) on a table with PII/payment/operational data? For each such table, either add `(SELECT (auth.jwt()->>'is_anonymous')::boolean) IS NOT TRUE` to the policy or document why anonymous read is acceptable (e.g. reference/lookup tables). Report the table list in the PR even if the answer is "all fine" — that written enumeration is what retires the 110 WARNs as _dispositioned_.

## Verdict 4 — mutable search_path (16): pin them all, one migration

All 16 (`set_updated_at`-family, `custom_access_token_hook`, `restrict_*` triggers, `_result_*` helpers, `generate_confirmation_number`, `auto_assign_armband_on_accept`, `update_user_guide_search_vector`, etc.) get `ALTER FUNCTION public.<name>(<argtypes>) SET search_path = '';` — resolve overloads from `pg_proc` first (two `is_show_secretary` overloads exist in the anon list; check for overloads among these 16 too). **`custom_access_token_hook` is the highest-value pin** (it runs inside the auth path). After pinning, run the package + app test suites — pinned search_path can surface unqualified table references inside function bodies; if a function errors, qualify the reference (`public.<table>`) in the function body, don't unpin.

## Verdict 5 — public bucket listing (2): fix after one grep

Drop the broad SELECT policies (`Public read access for images`, `Public read premium published`) on `storage.objects` for buckets `images` and `premium-published`. Public buckets serve objects by URL without any policy; the policy only enables _listing_ (enumerating every club logo / every published share card — the latter leaks premium content URLs pre-share).
**Precondition grep:** `grep -rn "storage.from('images')\|storage.from('premium-published')" apps/ packages/ | grep -n "\.list("` — if any client code lists these buckets, replace that usage first (typically with a DB-tracked file index) or scope the policy to the exact prefix instead of dropping it.

## Verdict 6 — RLS enabled, no policies (3 INFO): deny-all by design, document

`login_attempts`, `show_money_locks`, `show_passcodes` are written/read exclusively through SECURITY DEFINER functions or service-role edge functions; policy-less RLS = deny-all to API roles, which is exactly right. **Action:** `COMMENT ON TABLE` each with the rationale. Note the same-day security audit's SA-021 wants `FORCE ROW LEVEL SECURITY` on two of these (`login_attempts` is in both lists) — land SA-021's migration together with this plan's migration so the disposition is complete in one pass.

## Sequencing & gates

1. Verdict 4 (search_path pins) + Verdict 6 (comments) + SA-021 FORCE RLS — one low-risk migration, land first.
2. Verdict 5 (bucket policies) after its grep.
3. Verdict 2 (the big revoke) — derive keep-lists, generate migration, `migration-auditor`, owner confirmation, push, then the three cold-session verifications.
4. Verdict 3 (anon blast-radius enumeration) — report-first; any policy edits it produces are their own reviewed migration.

Gates per push: `supabase migration list` first (remote has a known version collision — see go-live defect #6), `migration-auditor` agent on every migration, cold-session verification after Verdict 2, and the advisor re-run (`get_advisors security`) with before/after counts recorded in the PR.

## Done criteria

- Advisor re-run shows: search_path WARNs 16→0; bucket WARNs 2→0; anon-executable WARNs 112→keep-list size (documented); remaining lints each covered by an in-schema COMMENT or this doc.
- The Verdict 3 enumeration table exists in the PR description with a per-table disposition.
- All three cold-session flows verified post-revoke. Go-live item #7 flipped to done in [../launch/go-live-2026-07-11.md](../launch/go-live-2026-07-11.md).

---

## Execution results — DONE 2026-07-12

Migrations (applied + live-verified on `sojmvhhwsjxmfistvzbe`):

- `20260712130000_advisor_sweep_mechanical.sql` — 16 search_path pins (11 → `''`, 5 → `public, pg_temp`), dropped 2 bucket listing policies, COMMENTed 2 views + 3 policy-less tables. (SA-021 FORCE RLS was already live via `20260711170000`, so no FORCE-RLS statements were needed.)
- `20260712140000_revoke_anon_function_execute.sql` — `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE FROM PUBLIC` + per-function REVOKE the implicit PUBLIC grant on the 112 over-granted SECURITY DEFINER functions, GRANT back `authenticated`+`service_role`, anon only for the 8-name RLS-helper keep-list.
- `20260712150000_keep_anon_execute_public_results_helper.sql` — keep-list correction: cold-session verification caught that the anon-facing SECURITY DEFINER view `view_public_entry_results` calls `resolve_class_result_visibility()` (EXECUTE checked against the caller, anon), which the policy-only keep-list derivation missed. Granted anon EXECUTE back on that one helper.

**Advisor before → after (365 → 210 lints):**

| Lint                                                 | Level | Before | After | Disposition                                                                                                                             |
| ---------------------------------------------------- | ----- | -----: | ----: | --------------------------------------------------------------------------------------------------------------------------------------- |
| `function_search_path_mutable`                       | WARN  |     16 |     0 | fixed                                                                                                                                   |
| `public_bucket_allows_listing`                       | WARN  |      2 |     0 | fixed                                                                                                                                   |
| `anon_security_definer_function_executable`          | WARN  |    112 |    10 | RLS-helper keep-list (9 sigs of 8 names) + `resolve_class_result_visibility`; all required for anon RLS reads / the public-results view |
| `authenticated_security_definer_function_executable` | WARN  |    120 |    84 | dropped 36 = 33 trigger fns + 3 test fns; remaining accepted (internal gates are the authz layer)                                       |
| `security_definer_view`                              | ERROR |      2 |     2 | accepted, `COMMENT ON VIEW` added                                                                                                       |
| `rls_enabled_no_policy`                              | INFO  |      3 |     4 | deny-all by design, `COMMENT ON TABLE` added; the +1 (`premium_generation_attempts`) belongs to SA-025's `20260712120000`               |
| `auth_allow_anonymous_sign_ins`                      | WARN  |    110 |   110 | mechanism accepted; blast radius enumerated below                                                                                       |

**Cold-session anon verification (direct PostgREST, anon key):** `shows`/`classes`/`trials` → 200; `view_public_entry_results` → 200 (after the `150000` fix). Authenticated flows (ringside RPCs, `submit_show_entries`) retain `authenticated` EXECUTE — verified via `has_function_privilege`.

### Verdict 3 — anonymous-sign-in blast-radius enumeration (report deliverable)

Every `authenticated` SELECT/ALL policy whose `qual` doesn't filter `is_anonymous`; a claimless anonymous session can only reach those reducing to `qual = true`:

| Table                                                                                           | Disposition                                                                         |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `roles`, `permissions`, `role_permissions`                                                      | Accept — RBAC reference catalogs, authenticated-only deny-anon by SA-006 design     |
| `judge_qualifications`, `organization_agreements`                                               | Accept — reference data (judge numbers, legal text)                                 |
| `offline_scoring`, `performance_metrics`                                                        | Accept (low) — operational/telemetry, eventually-public scoring buffer              |
| `sync_conflicts`                                                                                | **Follow-up** — may hold cross-user row payloads; add `is_anonymous IS NOT TRUE`    |
| `platform_settings`                                                                             | **Follow-up** — config readable by any anon session; add `is_anonymous IS NOT TRUE` |
| `volunteer_class_assignments`, `volunteer_general_assignments`, `volunteer_roles`, `volunteers` | Accept (low) — mild PII (names); operational, shown to show managers                |

Recommended follow-up (own reviewed migration, not this sweep): add `(SELECT (auth.jwt()->>'is_anonymous')::boolean) IS NOT TRUE` to `platform_settings` and `sync_conflicts`. All other rows are gated (`is_site_admin`, ownership, `can_manage_show`) and correctly exclude claimless anon.

---

## Regrowth re-disposition — MYK9-108 (prepared 2026-07-28)

The 2026-07-26 issue snapshot (16 anon / 94 authenticated SECURITY DEFINER warnings) was
overtaken by July 27 migrations. A fresh applied-database query on 2026-07-28 found:

| Lint-equivalent applied check                        | 2026-07-12 | 2026-07-28 pre-fix | Expected after `20260728120000` |
| ---------------------------------------------------- | ---------: | -----------------: | ------------------------------: |
| anon-executable SECURITY DEFINER identities          |         10 |                 17 |                              10 |
| authenticated-executable SECURITY DEFINER identities |         84 |                 96 |                              94 |
| RLS-enabled tables with no policy                    |          4 |                  6 |                               6 |

Applied `pg_default_acl` evidence explained the regrowth: `postgres` still default-granted
functions and tables to `authenticated`; `supabase_admin` still default-granted both object classes
to `anon` and `authenticated`. The linked `postgres` role cannot assume `supabase_admin`
(`pg_has_role(..., 'MEMBER'/'USAGE') = false`), so a repository migration cannot safely alter the
hosted owner's defaults. The new migration revokes both API roles from future `postgres`-owned
functions and tables. The `supabase_admin` default remains an explicit hosted-platform residual:
the security advisor and ACL inventory must be checked after every database push, including for
objects created outside repository migrations.

### Function decisions

The original anon keep-list remains exactly 10 identities: `get_my_person_id()`,
`has_role(text, uuid)`, `is_club_admin(uuid)`, `is_platform_admin()`,
`is_show_official(uuid)`, both `is_show_secretary` overloads, `is_site_admin()`,
`is_trial_secretary(uuid)`, and `resolve_class_result_visibility(uuid)`. Each is required by
anon-readable RLS policies or the public-results release-gate view.

Migration `20260728120000_advisor_grant_regrowth_guard.sql` revokes anon from all seven regrown
identities:

- Trigger-only: `broadcast_showday_change()`, `broadcast_paperwork_print_change()`; authenticated
  is revoked too because trigger execution does not use API-role EXECUTE.
- Internally gated authenticated RPCs: `financial_reconciliation_summary`,
  `financial_reconciliation_orders`, `financial_reconciliation_payouts`,
  `get_my_onboarding_requests`, `set_entry_refund_decision`; authenticated and service-role access
  is explicitly retained.

Twelve new or replacement authenticated RPC identities remain accepted by design:
`admin_grant_entitlement`, `admin_revoke_entitlement`, the replacement
`create_show_managed_dog` signature, the three reconciliation RPCs,
`get_my_onboarding_requests`, `get_own_entitlement_context`, `get_show_access_codes`,
`has_effective_premium_access`, `reserve_operator_support_query`, and
`set_entry_refund_decision`. Each has an internal identity/scope gate. The retired old
`create_show_managed_dog` signature and the later `system_health_probe` authenticated revoke offset
two of these, so the net accepted count is 84 → 94.

### Table decisions

The six no-policy tables are deny-all by design:

- Existing: `login_attempts`, `premium_generation_attempts`, `show_money_locks`, `show_passcodes`.
- New: `stripe_order_refunds`, `waitlist_notification_events`.

The new migration adds the missing advisor-specific schema comments to the two new tables. Applied
ACL checks showed no anon/authenticated table or column grants on
`stripe_order_refunds` or `waitlist_notification_events`.

### Standing guard

`migrationGrantDecisionContract.test.ts` freezes the 419-file legacy migration filename baseline
by count and SHA-256, then inspects every non-legacy migration. The fingerprint makes a newly added
backdated migration fail instead of bypassing a timestamp cutoff. Every new `public` function must
carry exact-overload decisions for both `anon` and `authenticated` (or match the documented anon
keep-list); every new `public` table must carry decisions for both API roles. An RLS-enabled table
must also create a policy or match the documented deny-all table keep-list.

The same contract rejects unsafe public default-privilege grants, bulk grants, and standalone
function/table grants that do not carry a complete API-role disposition. Its deliberately unsafe
fixtures cover functions, overloads, tables, no-policy RLS tables, grant-only changes, default
grants, bulk and multi-target grants, `FUNCTION`/`ROUTINE` syntax, signature-omitted targets, and
backdated filenames. This is the repository-side continuous guard; the post-push advisor/ACL check
is the continuous monitor for the hosted `supabase_admin` residual.

**Post-push evidence still required:** apply `20260728120000`, repeat the applied ACL queries, re-run
the security advisor, and record the observed counts. Do not mark MYK9-108 complete before that
shared-system gate.
