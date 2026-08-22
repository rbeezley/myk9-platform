## Plan Verification

### Requirements Audit

| Requirement | Status | Evidence |
| --- | --- | --- |
| Reproduce before changing code | Covered | `tasks.md` sections 1–2 put inventory and a red-capable page seam before any implementation decision. |
| Exercise judge-day-full plus `allow_waitlist = false` | Covered | `design.md` goal and task 2.1 name the exact case. |
| Prove whether a payable line reaches Stripe | Covered | `design.md` and task 1.3 require the exact negative assertions at both submission and Stripe boundaries. |
| Avoid charges and shared mutations | Covered | `proposal.md` non-goals and `design.md` primary-reproduction decision reject a live checkout. |
| Compare client and server decisions | Partial | The first draft named both paths but did not require predicate-by-predicate parity. |
| Explain the dated evidence | Covered | Task 2.3 compares August 18 incidents with the August 20 refresh. |
| Implement only if current main fails | Covered | `proposal.md` explicitly branches on reproduction outcome. |
| Testing and failure handling | Partial | The first draft required six shuffled runs but omitted the app working directory; the root config cannot resolve `@/` aliases. |
| Preserve operator safety | Covered | `design.md` retains authoritative denial, refund, and error alert. |
| Deployment/rollback | Covered | `design.md` states no deploy or rollback is required for an evidence-only outcome. |

### Coverage: 92/100

The first draft covered the payment-safety decision and exact user symptom, but it needed an explicit client/server parity checklist and a runnable app-scoped command.

### Top Gaps

1. Predicate-level client/server comparison — otherwise a mocked page test could hide semantic drift.
2. App-scoped Vitest invocation — otherwise the documented feedback loop fails for configuration rather than product behavior.

### Patched Plan

- **[ADDED]** `design.md` now requires parity across active statuses, confirmed assignments, both capacity limits, and NULL wait-list handling.
- **[ADDED]** `design.md` records the root-config failure mode and app-directory mitigation.
- **[EXPANDED]** tasks 1.2 and 3.1 now contain those checks and the exact runnable command.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This is evidence about a payment and entry-capacity boundary; even without production edits, closure requires source parity plus repeated page-level proof.

### Post-patch Coverage: 100/100

The patched artifacts now make every requirement executable and cite a failure response without introducing shared-system work.
