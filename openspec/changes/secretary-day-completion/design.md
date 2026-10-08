# Design

## Context

See proposal.md. Linear's full acceptance contracts own the scope. Existing surfaces are the ringside adapter and shared armband resolver, AKC HIT report, and waitlist judge-day cards. Secretary intent is calm control; judge intent is an invisible, durable ringside workflow.

## Goals / Non-Goals

Support the three existing workflows without duplicate pages or client-side capacity arithmetic. No automatic coin-flip decision, unrelated result redesign, payment change or shared fixture mutation.

## Decisions

- MYK9-977: hydrate existing armband replica scoped to the show; preserve unscoped provider sync. Scope remote counts and stale cleanup too. Use shared entry > assigned entry > assigned dog priority for ringside and check-in; preserve null missing values. Subscribe to armband changes and await all hydration before readiness. Reads remain cached and work offline.
- MYK9-973: share the pure award calculation with explicit odor-only HIT and odor-plus-HD HCD element rules, using verified August 2025 AKC Chapter 6 §§8–10. Render HCD in the existing report. Keep unknown/unscored/incomplete data provisional, inactive/cancelled rows excluded, and ties delegated to a human.
- MYK9-1016: an online React Query mutation calls a narrowly scoped manager RPC. One transaction sets or clears every confirmed assignment belonging to the actual judge/show/date. Preserve historical MAX merge semantics and the show/default fallback; do not copy capacity math. Acquire the existing judge-day advisory lock. Gate authenticated live-show manager/site admin, reject invalid values and empty targets, grant authenticated execution and explicitly revoke PUBLIC/anon. Do not use client class IDs as write scope or queue multiple full-row updates. After success refresh manager capacity, exhibitor availability and assignment replica. Disable offline saves, preserve edits on errors, never present pending values as authoritative counts.

## Risks / Trade-offs

- Scoped sync deleting other shows → scoped remote counts and cleanup boundaries with real cache proof.
- Award eligibility drift → reuse existing calculator controls and test HIT unchanged, HD-required, limited offerings, ties and provisional data.
- Partial capacity write or stale client scope → atomic server date/judge selection with scoped negative controls; no unrelated columns changed.
- Migration not yet applied → record deployment prerequisite; local SQL registration is not executed proof. New function types must be generated after application, not fabricated in generated output.

## Migration Plan

Prepare and review the capacity migration at the authoritative repository review-tier floor, including a migration-auditor lens; run behavioral SQL in isolated CI. No linked DB application is authorized. After approved merge/application, regenerate the complete deployed types and record actual capacity readback. Roll back UI through ordinary revert; clear overrides through the same manager operation. Keep migration history immutable.

The secretary guide change also requires regeneration of the AskQ document bundle. That generated edge-function path raises the final batch review floor to independent; Claude review is required for the final Codex-authored head. The product/offline and migration-auditor adversarial lenses remain additional evidence, not substitutes for that gate.

Review refinement: accepted large integer capacities require numeric percentage multiplication in the canonical reader. Preserve the complete latest reader and its ACLs, widening only that operation. SQL proof uses explicit authenticated manager write/read phases followed by service-role evaluator phases; invoker helpers assert their caller role and never elevate it.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: replication scope and a manager SQL write require broad app, authorization and behavioral database proof.

## Plan Verification

Coverage 90/100 → 100/100 after adding scoped cleanup, atomic partial-failure avoidance, offline error behavior and deployment/type prerequisites. Verified against all three full Linear contracts: armband priority/offline proof (decision 1), HCD rule/eligibility/tie/guide proof (decision 2), capacity set/change/clear/merge/source parity (decision 3). Security, empty target, read failure, capped sync, cancelled classes and migration compatibility all have tasks and spec scenarios. Execution proof remains pending; this score covers the plan only.
