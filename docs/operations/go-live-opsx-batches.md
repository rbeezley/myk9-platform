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
