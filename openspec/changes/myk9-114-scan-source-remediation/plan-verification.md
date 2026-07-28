## Plan Verification — Fresh Pass

### Requirements Audit

| Requirement                                           | Status                       | Evidence                                                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start and own MYK9-114                                | **Covered**                  | Linear is assigned and In Progress; `tasks.md` §5.3 keeps it open through the evidence gate.                                                                                          |
| Name each scan source concretely                      | **Covered**                  | `design.md` “Baseline evidence and concrete sources” names the view expressions, RBAC refresh, and exact embed consumers.                                                             |
| Fix or explicitly defer each source                   | **Covered**                  | `design.md` Decisions 1–2 fix view amplification; Goals/Non-Goals and Risk trade-off defer RBAC/embed/index work with owners/reasons.                                                 |
| Preserve authorization semantics                      | **Covered**                  | `design.md` Decision 3 plus `tasks.md` §2 role matrix and §4 verification.                                                                                                            |
| Preserve offline-first behavior                       | **Covered**                  | `design.md` Decision 4 and the “Offline entry replication contract” spec.                                                                                                             |
| Avoid duplicated product surface                      | **Covered**                  | `proposal.md` states no UI is added and explains why a link cannot solve the planner defect.                                                                                          |
| Test assertion-first and across roles                 | **Covered after patch**      | `tasks.md` §2.1–2.5 now distinguishes a green-before/green-after SQL characterization matrix from the red-before/green-after source-shape contract and supplies exact files/commands. |
| Handle empty/null caller context and claim revocation | **Covered after patch**      | `design.md` Decision 1 and access-preservation spec scenarios for no person, expired roles, and regenerated passcodes.                                                                |
| Atomic deployment and rollback                        | **Covered after patch**      | `design.md` Migration Plan and `tasks.md` 4.6 now define both the transaction source contract and an isolated injected-failure proof.                                                 |
| Prove bounded scan amplification                      | **Covered after patch**      | The spec and `tasks.md` 3.4/4.4 define a reset-incapable SQL diagnostic plus separate-session snapshot/read/snapshot orchestration.                                                   |
| Keep generated database types synchronized            | **Covered after correction** | The helper now lives outside exposed schemas; `tasks.md` 3.5 verifies generated public API types remain unchanged.                                                                    |
| Supply runnable verification commands                 | **Covered after patch**      | `tasks.md` §4 names the source test, SQL harness, local lint, package/app typechecks, and the repository-supported strict OpenSpec command.                                           |
| Re-measure after an approved reset                    | **Covered**                  | `design.md` Decision 5 and `tasks.md` 5.4–5.5 preserve approval gates and known-window evidence.                                                                                      |
| Feed MYK9-109 and coordinate MYK9-113                 | **Covered**                  | `proposal.md` source dispositions and `tasks.md` 5.1/5.5.                                                                                                                             |
| PR, CI, review, merge, archive, cleanup               | **Covered**                  | `tasks.md` §5.                                                                                                                                                                        |

### Coverage: 100/100 after fresh patch

This fresh pass invalidated the prior 100/100 score and scored the plan 84/100
before patching. The plan named the right architecture but did not account for
generated type drift, used an unsupported OpenSpec command, did not identify a
runnable SQL behavior harness, and described atomic failure testing without an
executable method. Those gaps are now explicit requirements and tasks; no
implementation-critical requirement remains implied.

### Top Gaps Patched

1. [ADDED] Canonical Supabase type regeneration check for the private-schema helper.
2. [EXPANDED] Exact SQL fixture file, isolated runner, and characterization-test
   semantics.
3. [EXPANDED] Exact supported OpenSpec, lint, and typecheck commands.
4. [EXPANDED] Actionable atomic failure proof and reset-incapable,
   separate-session scan evidence modes.

### Implementation-time design correction

[CORRECTED] PostgreSQL requires view callers to have `EXECUTE` on referenced
functions. The helper therefore moved from `public` to a non-exposed `private`
schema with function-only grants and no schema `USAGE` for API roles. This keeps
the view executable without adding a callable PostgREST RPC or generated public
API type.
