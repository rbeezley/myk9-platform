## Plan Verification

### Requirements Audit

| Requirement | Status | Evidence |
| --- | --- | --- |
| Apply secretary redesign lessons to Exhibitor | **Covered** | `design.md` Context and Decisions 1, 8, and 10 use canonical surfaces, shared truth, resolving actions, and progressive disclosure. |
| Finish the high-volume Exhibitor journey without duplicating surfaces | **Covered** | `proposal.md` Duplication Decision/Non-Goals and `tasks.md` 1.3, 6.8, 7.8. |
| Include all Premium capabilities | **Covered** | `exhibitor-premium-records` discovery contract and `tasks.md` 3.6–3.7, 7.4 cover Title Progress, Statistics, Health, Training, and Pedigree. |
| Support gifted/test-user Premium access | **Covered** | `design.md` Decisions 6–7 and `exhibitor-entitlement-management` grant/revoke requirements define complimentary access without Stripe. |
| Fix invalid records, dates, filters, and destructive actions | **Covered** | `exhibitor-premium-records` form/date/filter/training requirements and `tasks.md` Slice 1 plus 3.7. |
| Make Dog Details fit and remain discoverable | **Covered** | Modified `exhibitor-dog-management` contract and `design.md` Decisions 1 and 5. |
| Make Subscription/Pricing truthful for paid, gifted, trial, expired, and free | **Covered** | `exhibitor-entitlement-management` source/display requirements and `tasks.md` 5.5–5.6. |
| Reconcile My Shows, My Payments, counts, and entry actions | **Covered** | Added `exhibitor-journey-trust` requirements and `tasks.md` Slice 4 reuse existing truth contracts. |
| Error handling and recovery | **Covered** | Specs cover validation, mutation failure, entitlement failure, grant/revoke failure, delete recovery, and retry states; Tasks 2, 3, 5, and 7 test them. |
| Security and authorization | **Covered after patch** | `design.md` Decision 7A, entitlement server-authorization requirements, and Tasks 4.2–4.10 cover sanitized grant reads, RLS/RPC/direct bypass/non-owner cases, and downgrade data rights. |
| Rollback and migration compatibility | **Covered** | `design.md` Migration Plan/Risks and `tasks.md` Section 8 define additive rollout, fallback, preflight, cleanup, and reconstruction. |
| Performance and query scaling | **Covered after patch** | `design.md` Decision 6/Risks use one deduplicated server context; Task 4.8 requires query-plan evidence with a high-history fixture. |
| Expiration and device-clock edge cases | **Covered after patch** | Entitlement scenarios require server time and open-page invalidation; Tasks 5.1–5.2 and 7.2 verify them. |
| Operational evidence and monitoring | **Covered after patch** | `design.md` Risks and Tasks 7.9/9.1 require durable history, PII-safe logs, runbook checks, and tracking updates. |
| Full testing and real-user evidence | **Covered** | `tasks.md` Section 7 includes focused/full checks, isolated DB/RLS, responsive/dark/light walks, accessibility, and a low-tech user walkthrough. |

### Coverage: 100/100 after patch

The first draft scored 91/100. It was strong on UX/data integrity but only partial on capability-scoped trial consistency, live expiry, server enforcement, query cost, and operational visibility. Those gaps were patched in the proposal, design, entitlement spec, and tasks before validation.

### Patched Gaps

1. **[EXPANDED] Capability-scoped trial truth** — one server-evaluated context replaces caller-provided counts while preserving the current Analytics-only trial boundary.
2. **[EXPANDED] Time-bound access** — server time, bounded stale trust, scheduled invalidation, and focus/reconnect refresh cover open-page expiry.
3. **[ADDED] Server Premium authorization and data rights** — Health, Training, and Pedigree creation/updates require ownership plus account Premium, while owners retain read/export/delete rights after downgrade.
4. **[ADDED] Performance evidence** — one cached query and query-plan tests prevent per-component/N+1 entitlement reads.
5. **[ADDED] Operational evidence** — durable history, structured PII-safe failures, fallback mismatch checks, and a runbook gate are required.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The plan covers auth/RLS, migrations, paid access, core exhibitor financial/entry truth, and cross-feature responsive UX.
