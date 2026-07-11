## Validation Profile

- Risk: high
- Validation: full
- Rationale: This change touches RLS, migrations, database privileges, webhook authentication, paid API throttling, monitoring, secrets, and launch-critical shared systems.

## Global Constraints

- Do not add a page, dashboard, dialog, or parallel checklist; reuse `/admin/health`, `operator_alerts`, `docs/operations/go-live-runbook.md`, and the launch-readiness scorecard.
- Do not run a production database push, function deployment, secret rotation, dashboard mutation, live-money action, data deletion, DNS/Vercel mutation, PR creation, or merge without the required confirmation.
- Source-only evidence never closes a deployment, dashboard, browser, device, legal, live-money, or real-user gate.
- Follow TDD for behavior changes: record the focused RED command/output before production edits, then the GREEN command/output.
- Preserve offline-first and replication paths; the new monitoring and limiter records are online-only operational data.
- Keep migration versions unique. Never rename and apply the obsolete soft-delete migration if `20260710170000` is authoritative.
- The premium limit is five attempts per authenticated user and show in a rolling 15-minute window, with 24-hour retention and fail-closed 503 behavior.
- Push webhooks accept only `PUSH_WEBHOOK_SECRET`; never use `SUPABASE_SERVICE_ROLE_KEY` as an inbound fallback. Preserve the support function's legitimate downstream service-role bearer.
- Advisor changes operate on schema plus identity-argument signature, account for `PUBLIC`, preserve proven anonymous flows, and never mutate extension-owned objects.
- Preserve the user's July 11 report history. Append remediation evidence only after those source documents are present on this branch; do not recreate or overwrite uncommitted copies blindly.

## 1. OpenSpec and Evidence Baseline

- [x] 1.1 Validate all proposal, design, delta-spec, and task artifacts with `pnpm openspec validate go-live-2026-07-11-gate-remediation --type change --strict`; run `verify-plan` against the July 11 go-live report and security audit, patch every gap, and record the final coverage score (100/100 on 2026-07-11).
- [ ] 1.2 Record a redacted read-only evidence baseline covering cron job/run state, latest health snapshot, deployed `cron-health-check` version, relevant Vault/function-secret digests, remote migration lineage/live `soft_delete_person` definition, and all 364 before-remediation Supabase advisor entries (2 ERROR, 3 INFO, 359 WARN). (Migration parity, dry run, and the live redacted `soft_delete_person` fingerprint/behavior markers are complete; the health, secret-digest, deployed-version, and advisor portions remain open.)
- [ ] 1.3 [ADDED] [INTEGRATION GATE] Bring the user's uncommitted July 11 go-live report, security audit, and docs-index registration onto the implementation branch through their source commit or an explicitly reviewed patch before editing them; never overwrite the primary checkout's uncommitted files.

## 2. Batch A — Daily Health Monitoring

- [ ] 2.1 Add a migration-source contract test first, then add a SQL-only missed-snapshot watchdog scheduled after `daily-health-check`; it must query the indexed `cron-health-check` snapshot window, insert one unresolved `operator_alerts` row per missed UTC run with a stable dedupe key, and contain no `pg_net`, Vault, Edge Function, or secret dependency.
- [ ] 2.2 Verify watchdog schedule ordering, exact alert fields, query plan/index use, deduplication, recurrence after resolution, and rollback SQL with focused source tests plus a rolled-back database transaction when available.
- [ ] 2.3 [ADDED] Add focused tests first, then instrument `cron-health-check` with provider-supported in-progress/success/error check-ins for the `daily-health-check` Sentry Cron Monitor; a failed/missing Sentry call must not suppress the snapshot insert, and a successful snapshot with a failed check-in must remain externally visible as a missed heartbeat.
- [ ] 2.4 [SHARED-SYSTEM GATE] After approval, reconcile the stale Vault `service_role_key` with the current Edge runtime key, manually dispatch `cron-health-check`, prove a fresh snapshot lands, simulate a missed snapshot, and record the durable alert evidence.
- [ ] 2.5 [OPERATOR/SHARED-SYSTEM GATE] Configure the independent Sentry Cron Monitor schedule and named-human route, deploy the check-in instrumentation, and record missed-check-in and recovery notification evidence without sharing the database watchdog's delivery path.

## 3. Batch A — Migration Lineage

- [x] 3.1 Update `softDeletePerson.source.test.ts` first to require self-service authorization and role deactivation from `20260710170000`, observe RED, delete `20260710160000_self_service_soft_delete_person.sql`, and make the focused contract test GREEN.
- [x] 3.2 Run the duplicate-version scan, `supabase migration list`, and `supabase db push --dry-run`; stop on any unexpected apply/revert/repair proposal and record that no real database push is required for deletion of the obsolete unapplied file.

## 4. Batch B — FORCE RLS and Drift Prevention (SA-021)

- [x] 4.1 [CORRECTED] Add a failing source contract, record that `unified_ringside_overrides` was dropped by applied migration `20260623120000` and is absent from the live catalog, then create a migration that applies `FORCE ROW LEVEL SECURITY` to the four extant tables: `secretary_tasks`, `club_premium_templates`, `premium_generations`, and `login_attempts`, with exact rollback SQL documented.
- [x] 4.2 Add a repository-wide migration-state invariant that derives final public-table RLS/FORCE-RLS state without a static table allowlist and fails for any unforced RLS table; include self-tests proving a future drift fixture fails.
- [ ] 4.3 [SHARED-SYSTEM GATE] After approval and dry-run review, push the RLS migration and run the live `pg_class` verifier for `relrowsecurity = true AND relforcerowsecurity = false`, recording any named exception.

## 5. Batch B — Mechanical Security Fixes (SA-023, SA-028, SA-030)

- [ ] 5.1 Expand shared webhook-verifier tests for missing secret/headers, malformed and skewed timestamps, multiple signatures, valid signature, and invalid signature; extract one constant-time equality helper, route `resend-webhook` through `verifyStandardWebhookSignature`, route push auth through the same primitive, remove obsolete resend-specific signature code, and keep all focused tests GREEN.
- [ ] 5.2 Add production/development tests for attacker-controlled `dev-current-mock-user`, observe RED, gate the localStorage read in `authHelpers.ts` behind `import.meta.env.DEV`, and make the focused tests GREEN.

## 6. Batch B — Passcode Limiter Failure (SA-024)

- [ ] 6.1 Add a Deno-free rate-limit orchestration seam and failing tests proving limiter RPC errors return 503, persist a deduplicated `validate-passcode` operator alert without passcode material, and never call passcode validation; preserve the exact healthy 429 contract, integrate the seam, and make tests GREEN.
- [ ] 6.2 Verify alert-insert failure still returns 503, blocked-attempt handling remains correct, CORS/response contracts stay stable, and no log/title/detail/dedupe field contains the submitted passcode.

## 7. Batch B — Premium Generation Throttle (SA-025)

- [ ] 7.1 Add a failing migration-source contract, then create the dedicated `premium_generation_attempts` table, composite enforcement/retention indexes, FORCE RLS and narrow grants, atomic advisory-lock limiter RPC, service-only 24-hour prune function, and prune schedule; document rollback SQL.
- [ ] 7.2 Add failing handler-seam tests for allowed, sixth-attempt 429, independent-show windows, limiter 503, and no-Claude-call behavior; integrate the limiter after authorization but before Claude while preserving Claude-only fallback copy, then make tests GREEN.
- [ ] 7.3 Verify the 15-minute lookup uses the composite index, concurrent attempts cannot exceed five, the 24-hour prune is bounded, and all RPC/table privileges exclude `PUBLIC`, `anon`, and `authenticated` unless explicitly required by the service path.
- [ ] 7.4 [SHARED-SYSTEM GATE] After approval, push the limiter migration, deploy `generate-premium`, and smoke valid, exhausted, and limiter-failure paths without incurring unapproved paid traffic.

## 8. Batch B — Dedicated Push Secret (SA-029)

- [ ] 8.1 Compare redacted SHA-256 digests for Vault `push_webhook_secret` and project `PUSH_WEBHOOK_SECRET`, inventory all five push-trigger deployments/callers, and prepare a rotation, deploy, smoke, and rollback manifest.
- [ ] 8.2 Add failing shared and source-contract tests, remove every inbound `SUPABASE_SERVICE_ROLE_KEY` fallback, route announcement/chat/support triggers through `requirePushWebhookSecret`, preserve the legitimate downstream support bearer, and prove dedicated-secret success plus service-role-only rejection.
- [ ] 8.3 [SHARED-SYSTEM GATE] After approval, align/rotate the dedicated secret, deploy all five push-trigger functions, smoke them with the Vault bearer, and record that a service-role bearer is rejected.

## 9. Batch B — Supabase Advisor Disposition

- [ ] 9.1 [EXPANDED] Create `scripts/qa/db-drift/advisor-inventory.ts` with focused parser/generator tests and package scripts, save machine-readable before/post JSON under `docs/audits/2026-07-go-live-advisors/`, normalize by advisor code, level, schema, object name, and identity-argument signature, and fail on any unclassified repository-owned entry.
- [ ] 9.2 [EXPANDED] Inventory the 119 unique repository-owned SECURITY DEFINER functions behind 231 role warnings, including exact callers, trigger dependencies, inherited `PUBLIC` grants, direct role grants, and desired roles; generate signature-specific `REVOKE EXECUTE FROM PUBLIC, anon` plus narrow restore grants, preserve proven anonymous flows, and add source/call-site contract tests before any migration.
- [ ] 9.3 Build and run the complete access matrix for `view_public_entry_results` and `view_authenticated_entry_results` across anonymous, account, passcode, owner/co-owner, show-official, release-state, stale-passcode, and scored-column visibility; compare an invoker-view/narrow definer-function alternative and representative query plan, then implement it only if behavior and performance are preserved or record a time-bounded exception.
- [ ] 9.4 Disposition `login_attempts`, `show_money_locks`, and `show_passcodes` with evidence of no `anon`/`authenticated` table privileges, no client query call sites, and only intended service/hardened-function access; do not add placeholder policies.
- [ ] 9.5 Pin the exact signatures for `_result_timing_visible(text,text)`, `_result_visibility_preset(text,text)`, `auto_assign_armband_on_accept()`, `clear_prior_premium_default()`, `custom_access_token_hook(jsonb)`, `generate_confirmation_number()`, `restrict_message_update_columns()`, `restrict_payment_status_update()`, `restrict_subscription_column_updates()`, `set_updated_at()`, `touch_show_lifecycle_email_updated_at()`, `update_club_members_updated_at()`, `update_thread_last_message_at()`, `update_training_updated_at()`, `update_updated_at_column()`, and `update_user_guide_search_vector()` to `search_path = ''` only after fully qualifying every body reference; add focused source tests and exact rollback SQL.
- [ ] 9.6 Remove the broad SELECT/listing policies originating in `013_create_images_storage_bucket.sql` and `189_published_premium.sql` only after repository and live-use evidence proves `.list()` is unused; preserve public object retrieval for `images` and `premium-published` and add storage contract/smoke tests, otherwise record a time-bounded exception.
- [ ] 9.7 [ADDED] Document one project-level exception for the 110 `auth_allow_anonymous_sign_ins` warnings, citing the required ringside anonymous-session flow and cold-session runbook gate; verify the exception does not preserve unrelated anonymous function execution.
- [ ] 9.8 [SHARED-SYSTEM GATE] After approval, dry-run and push accepted advisor migrations, capture the after-remediation advisor export and live privilege/view/storage catalog evidence, and prove every before entry maps to a fix, exclusion, or exception.

## 10. Batch C — Operator-Owned Go-Live Rows

- [ ] 10.1 [OPERATOR] Configure Custom SMTP/DNS and prove branded auth-email throughput above the default cap; keep the hard blocker open until real evidence exists.
- [ ] 10.2 [OPERATOR] Start/complete TOS and privacy attorney review and record named sign-off or accepted-risk authority/deadline.
- [ ] 10.3 [OPERATOR] Choose and execute a production-data strategy for the 16 test people and five demo shows using a backup/export and approved target-state manifest; then review Heritage and premium assignments.
- [ ] 10.4 [OPERATOR] Complete Stripe live keys, webhook registration, Connect onboarding, Manual payout schedule, low-value live payment, and capped refund verification with redacted identifiers.
- [ ] 10.5 [OPERATOR] Verify the confirmation-email flow in a real mailbox and prove the AKC recipient gate.
- [ ] 10.6 [OPERATOR] Run the cold-incognito anonymous-surface walk and record screenshots/results.
- [ ] 10.7 [OPERATOR] Run the offline ringside airplane-mode round trip and record device/reconciliation evidence.
- [ ] 10.8 [OPERATOR] Configure and prove general Sentry alert routing to a named human, including the health cron route in task 2.5.
- [ ] 10.9 [OPERATOR] Complete production domain/DNS and Vercel cutover evidence with rollback steps.
- [ ] 10.10 [OPERATOR] Complete remaining admin-surface, show-day, print, and real-user evidence gates; review data-driven feature assignments and remove the stale removed-flag check from the runbook.

## 11. Full Verification, Tracking, Review, and Merge

- [ ] 11.1 Run focused Edge/client tests, migration/source contract tests, database/security QA, duplicate-version scan, app typecheck/lint, repository typecheck/lint/build, and the full test suite once; stop any hanging runner after 60 seconds and record limitations rather than looping.
- [ ] 11.2 Run OpenSpec implementation verification and a second-opinion security/database review; fix all CRITICAL and straightforward WARNING findings, then re-run the affected focused checks.
- [ ] 11.3 After each completed slice, append evidence to the July 11 go-live report and security audit and synchronize `OPEN-TODOS.md`, the go-live runbook, launch-readiness scorecard, and `docs/README.md` without rewriting original findings; every accepted risk must name its risk, owner, deadline, and launch decision authority.
- [ ] 11.4 [EXPANDED] Preserve separate PR boundaries for health monitoring and migration lineage; split security work further when RLS/grants/views, throttling, or secret deployment would be unsafe to review together. Include `Tracked in openspec change: go-live-2026-07-11-gate-remediation`, CI/test evidence, rollback SQL, and all blocked approval gates in every PR.
- [ ] 11.5 [SHARED-SYSTEM GATE] Merge only after required review and CI are green; archive the OpenSpec change only after every required PR is merged and every remaining operator/shared-system row is evidenced or explicitly accepted with owner and deadline.
