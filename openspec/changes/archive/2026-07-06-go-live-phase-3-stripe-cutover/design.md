## Context

Phase 3 switches the platform from sandbox/test Stripe to live money. The runbook is deliberately operator-led, and the entry gate depends on MP-04 mode-scoped Stripe IDs being merged and deployed. In the current main branch, that MP-04 source is not present, so the preflight must report the gate as blocked rather than attempting live work.

No UX-facing work is involved.

## Goals / Non-Goals

**Goals:**

- Provide a tested TypeScript preflight for local/source Stripe cutover readiness.
- Provide read-only SQL for database evidence after approvals.
- Keep MP-04 mode-scoping as an explicit blocker until merged/deployed.
- Keep every live-money/dashboard/secret/database write as an operator/shared-system gate.

**Non-Goals:**

- Do not mutate Stripe, Supabase, GitHub, Vercel, or production data.
- Do not perform live card charges or refunds.
- Do not purge Stripe IDs without explicit approval.
- Do not add new app UI.

## Decisions

1. Report missing MP-04 source as a failure unless `--allow-blocked` is used.
   - Rationale: live cutover cannot proceed safely without mode-scoped Stripe IDs.

2. Keep the SQL checklist read-only.
   - Rationale: cutover writes such as purge, secret rotation, and founding-member grants require explicit approval.

3. Verify runbook/source readiness separately from live dashboard state.
   - Rationale: dashboard state is the operator's evidence gate; source checks reduce surprises before that gate.

## Risks / Trade-offs

- The preflight will stay blocked until the Phase 0 payment PR lands -> this is expected and should appear in the morning checklist.
- SQL can prove database state only after an approved connection is supplied -> no DB evidence is collected by default.
- Stripe dashboard state cannot be inferred from source -> the tracker must keep all Phase 3 runbook items unchecked.

## Migration Plan

1. Add preflight script, SQL checklist, focused tests, and package scripts.
2. Run focused tests, local preflight, OpenSpec validation, and diff hygiene.
3. Update runbook/tracker with evidence and gates.
4. Open a PR. Do not archive until merged and Phase 3 gates are completed or explicitly deferred.

Rollback: remove the preflight files, package scripts, OpenSpec change, and tracking-doc updates. No database or Stripe rollback is needed.
