## Context

Phase 0 of the Go Live Runbook currently has three open agent-owned or agent-preparable items:
edge-function drift audit/deploy prep, money-path hardening Phases 1-3, and the remaining
scorecard evidence/code close-out. Phase 1 money-path hardening has already landed and been pushed;
the next safest code slice is MP-03 because it is code-only and does not require a real database
push or edge-function deploy to prepare the PR.

The user explicitly authorized autonomous local work, PR preparation, dry-runs, and evidence
capture across Phases 0-4, while reserving shared-system writes and merges for explicit approval.
This B0 change is the first coherent batch under that model.

## Goals / Non-Goals

**Goals:**

- Keep one OpenSpec change active for the B0 Phase 0 batch.
- Land or prepare payment-link duplicate delivery hardening with assertion-first tests.
- Prepare mode-scoped Stripe ID work and migration dry-run evidence without pushing it.
- Refresh edge-function drift evidence and list deploy approvals needed before marking 0.4 done.
- Update runbook/batch tracking only when completion evidence is real.

**Non-Goals:**

- Do not add new UX surfaces or duplicate existing admin/payment/operator pages.
- Do not mark operator-gated, dashboard-gated, deploy-gated, or real-money items complete from repo
  evidence alone.
- Do not perform real `supabase db push`, `supabase functions deploy`, dashboard writes, Stripe live
  actions, or PR merges without approval.

## Decisions

1. **Use one B0 OpenSpec change with itemized tasks.** This preserves the paper trail while avoiding
   a separate apply/archive loop per checkbox. If a payment/schema slice becomes too risky for one
   PR, split the implementation PR while keeping this change active until B0 is either complete or
   explicitly narrowed.

2. **Start with MP-03 before MP-04.** MP-03 is a high-severity refund bug and can be fixed with
   code/tests only. MP-04 requires a migration and affected function deploys; it can be prepared and
   dry-run in the same batch but cannot be fully completed without database/function approvals.

3. **Treat drift audit as evidence-first.** The batch can run inventory and byte-level comparisons,
   but any actual edge-function deployment remains confirmation-gated. Deployed-ahead functions stop
   the deploy path until recovered to source.

4. **Keep evidence docs conservative.** The runbook should only flip checkboxes once code is merged,
   schema/functions are pushed/deployed when required, and staging/runtime/operator evidence exists.
   Blocked gates get exact commands and approval needs instead of optimistic completion marks.

## Risks / Trade-offs

- Payment webhook regressions could affect refunds or paid entry stamping. Mitigation: write
  assertion-first webhook tests around duplicate delivery before implementation and run focused edge
  function tests.
- MP-04 schema changes could block checkout if function deploy order is wrong. Mitigation: prepare
  migration, rollback notes, and dry-run; do not mark complete until schema is pushed and functions
  are redeployed with approval.
- Edge-function drift downloads may show deployed-ahead code. Mitigation: document the deployed
  artifact and stop deploy prep for that function until source is recovered.
- Scorecard evidence can be overstated. Mitigation: keep Yellow rows Yellow unless the runbook's
  named evidence has actually been gathered.

## Migration Plan

MP-03 has no migration. MP-04 will use a new forward-only migration that adds `livemode` scoping to
Stripe customer/account persistence, updates uniqueness for `stripe_customers`, and backfills
existing rows as test-mode. Rollback, if needed, must be a follow-up migration and function rollback
to prior lookup behavior; applied migrations are never edited.

## Open Questions

- Whether B0 should include the full MP-04 migration/function implementation in the same PR as MP-03
  depends on the size of the touched edge functions after the first slice.
- Edge-function drift deploy completion depends on approval and a fresh diff proving no deployed-ahead
  function would be clobbered.
