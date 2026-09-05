## Context

See `proposal.md` for motivation. The affected behavior is spread across four existing myK9Show surfaces plus repository/scheduled audit instructions. The class-creation store currently performs a CommonJS `require` inside browser ESM; the show wizard retains fallback class definitions but does not render all of them; club show cards nest an action trigger inside a keyboard-activatable parent; and Trial Secretary preview/PDF paths calculate overlapping values independently. The canonical audit fixture already exists in `apps/myk9show/src/test/e2e/helpers/testUsers.ts` and private environment configuration.

## Goals / Non-Goals

**Goals:**

- Repair the existing secretary workflows with focused shared helpers and tests.
- Preserve the secretary intent of “That was easy,” including large targets, keyboard predictability, reachable cloned state, and trustworthy report math.
- Keep the audit fixture identity in one repository source of truth and keep secrets out of committed instructions and logs.

**Non-Goals:**

- No new page, wizard, report format, template catalog, fixture account, or authentication behavior.
- No hosted-data, payment, database, RLS, or replication mutation.
- No redesign of unrelated club cards or registry reports.

## Decisions

### Use existing store and selection models

Replace the dynamic CommonJS store lookup with the existing template store's safe ESM/state API, preserving the current class-creation store contract. Merge retained fallback definitions into the existing Classes grid rather than silently discarding them or adding a separate “custom classes” surface. Alternative: rebuild template retrieval inside class creation. Rejected because it duplicates a source of truth.

### Keep show-card semantics at the existing call sites

Stop propagation for click and key activation at the menu trigger, add a show-specific accessible label and selected menu focus behavior, and retain direct card activation. Review the Past Shows sibling for the same nesting pattern and share a helper only if the existing structure makes that smaller. Alternative: add another details link or menu. Rejected because the current destinations are already correct.

### Centralize Trial Secretary report policy

Create one typed report-value policy that accepts the actual schema-backed trial date and entries, rejects unsupported/missing dates, applies the documented 2025/2026 schedule, and returns total entries, excluded runs, paid runs, rate, and total. Both HTML preview and official PDF builder consume it. Prefer the official form for submission instructions; remove stale duplicate prose if it cannot be sourced from the same canonical data. Alternative: patch each total independently. Rejected because it preserves the divergence that caused the defect.

### Resolve audit identity, never credentials, from committed configuration

Update the reusable role-journey skill and weekly automation prompt to instruct the runner to resolve the secretary fixture from `testUsers.ts` plus private environment variables. Missing/invalid credentials become an environment coverage gap. The scheduled prompt update is a shared-system mutation and remains gated for explicit approval; repository changes and preflight can proceed independently.

### Offline-first impact

No persistent show-day query or mutation changes. Existing replication-backed show/trial/class data remains the input to these UI/report paths; no direct Supabase read is introduced.

## Risks / Trade-offs

- **[Fallback class identity collides with a template definition]** → Merge by the existing stable class identifier and add renamed/non-template clone coverage.
- **[Static store imports create a circular dependency]** → Inspect the actual store dependency graph and use the store's exported state accessor or dependency injection pattern already present in the repo.
- **[Nested interactive semantics remain fragile]** → Add focused pointer/Enter/Space/Escape tests and browser replay at all required viewports.
- **[Fee schedule becomes stale again]** → Encode explicit supported years and fail closed for unknown years instead of retaining a universal fallback.
- **[Automation prompt cannot be updated locally]** → Land the repository source-of-truth correction first and record the gated prompt mutation separately until approved.

## Migration Plan

Ship as source-only application and instruction changes behind existing routes. Rollback is a normal code revert; no data migration or cleanup is required. Update the scheduled prompt only after explicit approval, then run a fresh read-only sign-in preflight and multi-viewport browser verification before closing the five Linear issues.
