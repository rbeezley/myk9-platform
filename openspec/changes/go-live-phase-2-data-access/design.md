## Context

Go Live Runbook Phase 2 is verification-heavy. The risky failures are silent: a header-only judge CSV can produce no preload, an incomplete reseed can leave `judge_assignments` empty, missing role grants can block show-day access, and passcode/cron configuration can look fine until a cold ringside walk.

Phase 1 is not complete, so this change prepares evidence and commands without marking gated Phase 2 items done. Shared-system writes, dashboard toggles, seed repairs, judge import pushes, and live cold-session walks remain approval/operator-gated.

There is no UX-facing surface in this change. It does not duplicate an app page; it tightens operational verification around existing runbooks and seed/import tooling.

## Goals / Non-Goals

**Goals:**

- Provide a tested TypeScript verifier for local Phase 2 source readiness.
- Provide one read-only SQL checklist for staging/prod seed and access evidence.
- Make a header-only judge CSV an explicit blocker before migration generation.
- Update OpenSpec and Go Live tracking docs so prepared work and operator gates are distinguishable.
- Preserve secretary/show-day reliability by catching data gaps before Phase 4 rehearsal.

**Non-Goals:**

- Do not obtain, synthesize, or commit real AKC/UKC judge export data.
- Do not generate or push a judge preload migration until real judge rows exist.
- Do not run seed repairs, `supabase db push`, dashboard changes, or live passcode walks without explicit approval.
- Do not add new UI, pages, sheets, dialogs, or app workflow surface.

## Decisions

1. Use a TypeScript CLI under `scripts/go-live/` rather than a one-off shell snippet.
   - Rationale: the repo standard is TypeScript, and tested parsing avoids repeating fragile ad hoc commands.
   - Alternative considered: docs-only SQL. Rejected because it would not catch the local header-only judge CSV before migration generation.

2. Keep database checks in a separate `.sql` artifact and execute them only when `--db-url` is supplied.
   - Rationale: local runs can proceed overnight without credentials or network, while staging/prod evidence stays one command away.
   - Alternative considered: automatically reading linked Supabase credentials. Rejected because worktrees may not have `supabase/.temp`, and implicit shared-system access is too easy to misread as mutation-ready.

3. Use read-only database transactions for live checks.
   - Rationale: Phase 2 evidence should be safe to gather before approval; repairs remain explicit follow-up gates.
   - Alternative considered: bundling repair SQL. Rejected because seed repairs and imports are shared-system writes.

4. Keep runbook checkboxes unchecked until full evidence exists.
   - Rationale: prepared repo work is valuable, but the launch document must only show 100% complete items as complete.

## Risks / Trade-offs

- Header-only CSV remains blocked overnight -> morning checklist must ask for real judge exports rather than pretending the agent can finish it.
- `cron.job` visibility can vary by database role -> the SQL reports a failing command if access is denied; that becomes evidence to run with an appropriate read-only/admin connection.
- Optional `psql` execution depends on local `psql` availability -> the verifier still prints the SQL file path and can be run manually in Supabase SQL editor if needed.

## Migration Plan

1. Add the TypeScript verifier, tests, SQL checklist, and package script.
2. Run focused verifier tests and OpenSpec validation.
3. Update the Go Live Runbook and OpsX batch tracker with prepared evidence and remaining gates.
4. Open one PR. Do not archive until the PR is merged and the remaining Phase 2 evidence is either completed or explicitly deferred.

Rollback: remove the verifier script, test, SQL checklist, package script, and tracking-doc updates. No database rollback is required because this change performs no writes.

## Open Questions

- Which AKC/UKC export format will be used for the real preload data?
- Should the first live Phase 2 database evidence be captured from staging only, or staging plus prod if demo data is wanted in prod?
