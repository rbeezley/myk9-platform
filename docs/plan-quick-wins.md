# Quick Wins Batch Plan

## Scope

- MYK9-168: reproduce the club payment click finding on staging and close it with evidence if it no longer reproduces.
- MYK9-162: register the roster drill-down E2E spec and reconcile suite-map drift until the checker passes.
- MYK9-139: show a resolved support-ticket owner name/email with a UUID fallback.
- MYK9-143: remove the remaining raw class UUID from the default class-details workflow and preserve human-readable judge context.

## Implementation

1. Capture the MYK9-168 real-pointer staging result before changing code.
2. Repair the E2E suite map with conservative classifications and remove only the stale entry proven absent.
3. Enrich support tickets from `people` using the existing auth-user relationship, keeping fallback behavior for unresolved owners.
4. Remove the generic class-details ID row and add focused rendering coverage.

## Testing and evidence

- Run the affected Vitest files first.
- Run `pnpm qa:e2e-map:check` and `git diff --check`.
- Run app typecheck and the full app test suite once the focused checks are green.
- Record the staging pointer-reproduction result for MYK9-168 before closing it.
