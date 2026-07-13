# Go Live OpsX Batch Plan

> Status: Active helper plan for `opsx:ship batch` runs.
> Source of truth for launch readiness remains `docs/operations/go-live-runbook.md`.

This plan groups open Go Live Runbook work into coherent OpenSpec batches so Codex can prepare
overnight implementation PRs without paying the full apply/archive cost for every checkbox.

## Operating Model

Use one OpenSpec change per batch. Keep the change active until the batch implementation PR is
merged, required evidence is recorded, and the runbook/tracker reflects the result. Archive once
per batch, not once per runbook item.

Overnight/autonomous work may:

- create worktrees and feature branches
- edit code, tests, docs, migrations, and OpenSpec artifacts
- run local verification, OpenSpec validation, CI-facing checks, and Supabase dry-runs
- commit, push branches, and open implementation PRs
- update this tracker and the runbook when an item is fully proved complete

Overnight/autonomous work must pause for approval before:

- real `supabase db push`
- Supabase function deploys, secrets changes, Management API PATCHes, or production DB writes
- merging PRs
- force-pushes
- external-service writes or production dashboard changes

When an approval gate blocks one item, continue with independent items in the same batch if safe.
Document the blocked command, evidence gathered so far, and exact approval needed.

An approval gate pauses only that action. It must not stop the overnight run while any independent
agent-owned Phase 0-4 work remains. Record the blocked gate in the OpenSpec tasks, PR body, and
morning checklist, then advance to the next independent task. If the current batch is exhausted,
continue with the next earliest batch that has safe agent-owned work.

## Batch Queue

### B0 - Phase 0 Engineering Blockers

OpenSpec change: `go-live-phase-0-engineering-blockers`

Runbook scope:

- 0.4 Edge-function drift audit and repo-ahead batch deploy
- 0.5 Money-path hardening Phases 1-3
- 0.7 Motion-consistency and remaining Yellow-dimension code/evidence work

Default strategy:

- Start with code-only and dry-run-safe tasks.
- Keep edge-function deploys and real DB pushes approval-gated.
- Split payment/RLS migrations into separate implementation PRs if review risk warrants it, but
  keep one OpenSpec change until the Phase 0 batch is complete or explicitly narrowed.

Ready for morning review when:

- implementation PRs are open with test plans and approval-gated commands listed
- migration/function dry-runs are attached when relevant
- runbook items are marked complete only when merged, deployed/pushed, and verified

Current B0 run — 2026-07-06:

- OpenSpec change `go-live-phase-0-engineering-blockers` created and validated.
- PR #1170 merged.
- MP-03 duplicate payment-link delivery hardening merged with assertion-first tests.
- MP-04 mode-scoped Stripe customer/account migration and function changes merged.
- Focused tests: `pnpm vitest run supabase/functions/_shared/entryPaymentReconcile.test.ts
supabase/functions/_shared/entryPaymentUpdateReconcile.test.ts
supabase/functions/_shared/stripeMode.test.ts
supabase/functions/_shared/connectAccountMapper.test.ts
src/test/database/stripeWebhookEntryPaymentRequest.source.test.ts
src/test/database/stripeLivemodeScoping.source.test.ts` — 38 passed.
- Typecheck: `pnpm typecheck` — passed.
- Migration push: `20260706013906_stripe_livemode_scoped_ids.sql` applied to
  `sojmvhhwsjxmfistvzbe`; follow-up `supabase db push --dry-run` reported the remote database
  is up to date.
- Edge-function inventory re-audit (2026-07-12): 31 name matches, zero deployed-only, and zero
  repo-only functions. `send-notification` was retired after its 30-day dashboard log check showed
  no events; `push-trigger-support-message` is deployed.
- Strict per-function bundle comparison: 26 exact matches, four approval-gated HTTP-helper
  catch-up functions, and deployed-ahead `stripe-upgrade-subscription`. See
  [`edge-function-drift-audit-2026-07-12.md`](edge-function-drift-audit-2026-07-12.md).

Morning approval checklist:

- Record staging payment verification for MP-03/MP-04 after the function deploys.
- The fallback-extension source decision for deployed-ahead `stripe-upgrade-subscription` merged in
  [#1313](https://github.com/rbeezley/myk9-platform/pull/1313), and the function was deployed and
  bundle-verified on 2026-07-13.
- The four-function HTTP-helper catch-up batch was approved, deployed, and smoke-verified on
  2026-07-13. Go Live Runbook 0.4 is complete.
- Keep Go Live Runbook 0.5/0.7 unchecked until remaining staging evidence is recorded.

### B1 - Phase 1 Platform And Deploy Pipeline

OpenSpec change: `go-live-phase-1-platform-deploy`

Runbook scope:

- 1.1 CI-gated production deploys
- 1.2 Auth email Custom SMTP rate-limit cutover
- 1.3 Kill-switch posture check and flip rehearsal

Default strategy:

- Prepare repo changes, scripts, verification notes, and PRs.
- Treat GitHub/Vercel/Supabase dashboard changes as operator or approval-gated actions.
- Capture exact dashboard/API steps in the PR body when they cannot be run unattended.

Ready for morning review when:

- required repo changes are in PR
- operator dashboard steps are checklist-ready
- rollback steps are linked and current

Current run, 2026-07-06:

- OpenSpec change `go-live-phase-1-platform-deploy` created.
- Implementation PR: #1173.
- Added source verifier command: `pnpm qa:go-live:phase1`.
- Added focused test command: `pnpm qa:go-live:phase1:test`.
- Local verifier evidence:
  - `ok deploy_workflow_ci_gate: CI-gated production deploy workflow source is staged`
  - `warn vercel_git_auto_deploy_disable: not yet set; expected until one CI-gated production deploy is validated`
  - `ok auth_email_management_patch_runbook: Management API PATCH procedure is documented`
  - `ok show_day_kill_switch_source_defaults: all four show-day realtime source defaults are true`
  - `ok send_auth_email_hook_source: hook source references signature and Resend secrets`
- No GitHub, Vercel, or Supabase shared-system mutation was run.

Morning/operator checklist:

- Add GitHub Actions secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Set repo variable `PRODUCTION_DEPLOY_ENABLED=true`, then validate one successful post-CI
  Deploy Production run while Vercel Git auto-deploy remains ON.
- Only after that validation, land the `apps/myk9show/vercel.json` config-as-code change
  setting `git.deploymentEnabled.main=false`.
- Back up Supabase Auth config and apply the Management API PATCH for Resend Custom SMTP +
  `rate_limit_email_sent: 100`.
- Prove production `VITE_SHOW_*` env vars are unset/true, then rehearse one false/restore
  kill-switch flip.

### B2 - Phase 2 Data, Seeds, And Access

OpenSpec change: `go-live-phase-2-data-access`

Runbook scope:

- 2.1 Judge directory preload
- 2.2 Seed and fixture verification
- 2.3 Passcode ringside identity live verification

Default strategy:

- Prepare import/migration tooling and validation SQL.
- Do not invent judge data; wait for real AKC/UKC exports.
- Run local/source verification where possible, and queue staging/prod checks that need live
  credentials or dashboard toggles.

Ready for morning review when:

- missing operator inputs are explicit
- seed/access checks have runnable commands
- any generated migration has a dry-run result

Current run, 2026-07-06:

- OpenSpec change `go-live-phase-2-data-access` created.
- Implementation PR: #1172.
- Added source/read-only verifier command: `pnpm qa:go-live:phase2 --allow-blocked`.
- Added focused test command: `pnpm qa:go-live:phase2:test`.
- Added read-only DB evidence SQL: `scripts/go-live/phase-2-data-access.sql`.
- Local verifier evidence:
  - `fail judge_csv_data_rows: 0 judge data rows after header`
  - `ok judge_importer_present: scripts/import-judges.ts`
  - `ok seed_demo_phase2_tokens: seed-demo.sql references required Phase 2 demo data`
  - `ok stale_anon_cleanup_source: cleanup_stale_ringside_anon_users migration source check`
- No shared-system mutation was run. No judge preload migration was generated because real judge
  exports are still missing.

Morning/operator checklist:

- Provide real AKC + UKC judge exports before asking the agent to generate the preload migration.
- Run staging DB evidence with a read-capable URL:
  `pnpm qa:go-live:phase2 --db-url "$DATABASE_URL"`.
- If any seed/access row fails, approve the appropriate repair action, such as rerunning
  `supabase/seed-demo.sql`.
- Prove Supabase anonymous sign-ins are ON in staging/prod before cold passcode walks.
- Run cold incognito judge (`jh3k9`) and steward (`s7m2p`) walks after Phase 1 gates are green.

### B3 - Phase 3 Stripe Live Cutover

OpenSpec change: `go-live-phase-3-stripe-cutover`

Runbook scope:

- 3.1 through 3.11 Stripe live-mode and payout setup

Default strategy:

- Prepare code, SQL, command checklists, and rollback notes only.
- Do not toggle live mode, rotate secrets, purge Stripe IDs, run live payments, or change payout
  settings without explicit approval.
- Keep real-money validation as a morning/operator gate.

Ready for morning review when:

- all commands are staged with placeholders called out
- rollback path is current
- live-money tasks are clearly separated from repo work

Current run, 2026-07-06:

- OpenSpec change `go-live-phase-3-stripe-cutover` created.
- Implementation PR: #1174.
- Added preflight command: `pnpm qa:go-live:phase3 --allow-blocked`.
- Added focused test command: `pnpm qa:go-live:phase3:test`.
- Added read-only DB checklist: `scripts/go-live/phase-3-stripe-cutover.sql`.
- Local preflight evidence:
  - `fail mp04_mode_scoping_source_gate: missing: livemode, .eq('livemode', resource_missing, mode_mismatch`
  - `ok stripe_cutover_functions_present: required Stripe functions are present`
  - `ok phase3_runbook_step_coverage: Phase 3 runbook step markers are present`
  - `ok stripe_platform_runbook_coverage: Stripe platform live cutover markers are present`
  - `ok connect_webhook_source: connected-account webhook source markers are present`
- No Stripe, Supabase secret, database write, or live payment action was run.

Morning/operator checklist:

- Merge/deploy the MP-04 mode-scoped Stripe ID implementation and redeploy affected Stripe
  functions before starting live cutover.
- After approval, run the read-only DB checklist:
  `psql "$DATABASE_URL" -f scripts/go-live/phase-3-stripe-cutover.sql`.
- Toggle Stripe live mode and enable Connect only when ready to take real money.
- Create live account-scoped and connected-account webhook endpoints and record both `whsec_...`
  secrets.
- Rotate `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, verify rollback keys are available, then
  purge sandbox-scoped Stripe IDs only after explicit approval.
- Set live platform payout schedule to Manual, verify Vault/cron secrets, smoke cron, run one
  low-value entry payment + refund, grant founding members, and concierge-onboard first clubs.

### B4 - Phase 4 Evidence Pass

OpenSpec change: `go-live-phase-4-evidence-pass`

Runbook scope:

- 4.1 Show-day re-walk
- 4.2 Offline reconnect rehearsal
- 4.3 Venue hardware print test
- 4.5 Real-user testing
- 4.6 Scorecard close-out

Default strategy:

- Prepare scripts, QA checklists, fixtures, and focused fixes found during rehearsals.
- Treat venue hardware and real-user sessions as operator evidence gates.
- Prioritize show-day secretary reliability and offline-first behavior when findings compete.

Ready for morning review when:

- rehearsal materials and any fixes are in PR
- unresolved operator evidence gates are listed
- scorecard changes only mark rows green when evidence exists

Current run, 2026-07-06:

- OpenSpec change `go-live-phase-4-evidence-pass` created.
- Implementation PR: #1175.
- Added evidence checklist: `docs/operations/go-live-phase-4-evidence-checklist.md`.
- Added verifier command: `pnpm qa:go-live:phase4 --allow-blocked`.
- Added focused test command: `pnpm qa:go-live:phase4:test`.
- Local verifier evidence:
  - `ok phase4_checklist_coverage: operator checklist covers all Phase 4 gates`
  - `ok phase4_runbook_coverage: runbook lists all Phase 4 evidence gates`
  - `ok scorecard_yellow_gate_tracking: scorecard still tracks Phase 4 evidence dimensions`
  - `ok print_report_source_test_coverage: representative report tests exist; hardware proof still required`
  - `fail phase4_live_evidence_recorded: missing evidence slots: show-day re-walk evidence:, offline reconnect evidence:, venue hardware print evidence:, real-user testing evidence:, scorecard close-out evidence:`

Morning/operator checklist:

- Run show-day re-walk on staging and record: show-day re-walk evidence: `<link>`.
- Run two-browser offline reconnect rehearsal and record: offline reconnect evidence: `<link>`.
- Run venue hardware print test and record: venue hardware print evidence: `<link>`.
- Run real-user testing with one secretary and one or two exhibitors, then record:
  real-user testing evidence: `<link>`.
- Only after the above passes, update the scorecard and record:
  scorecard close-out evidence: `<link>`.

### B5 - Phase 5 Launch-Day Verification

OpenSpec change: `go-live-phase-5-launch-day`

Runbook scope:

- 5.1 through 5.9 morning-of checks

Default strategy:

- Automate or script repeatable read-only checks.
- Keep production writes, real payments, deploy changes, and dashboard changes approval-gated.
- Prefer a single launch-day verification PR or doc-only update unless code changes are needed.

Ready for morning review when:

- machine-checkable steps have commands or scripts
- manual-only checks are isolated
- the launch-day operator checklist is short and current

## Next Batch Selection Rule

When the user says `continue` under the launch-readiness goal, choose the earliest batch with
open Agent-owned work that is not blocked by a required operator input. If two batches are equally
available, prefer the one that improves secretary/show-day reliability or unblocks later gates.
