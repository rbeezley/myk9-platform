# P3 bug and dead-code batch

> **Status:** Active

## Scope

Fix the nine confirmed P3 defect behaviors represented by MYK9-305, MYK9-309,
MYK9-314, MYK9-319, MYK9-320, MYK9-321, MYK9-327, and the three bundled edge
function defects in MYK9-334. Consolidate the five dead-code sweeps in
MYK9-298, MYK9-308, MYK9-313, MYK9-322, and MYK9-328 only where whole-repo
reference evidence confirms the symbols are unreachable.

## Implementation order

1. Add red/green focused tests and fix Show Map ordering, self-check-in error
   defaults, QR checksum validation, styled entry-blank payment mapping, score
   area-time position preservation, registry helper usage, and edge-function
   failure handling.
2. Replace support-ticket two-step creation with the smallest transactional
   server-side path permitted by the existing database conventions and tests.
3. Delete verified dead modules/exports and their test-only coverage across the
   five sweep areas. Delete the replication TTL machinery; do not wire its
   refresh path because wall-clock expiry would create false-empty offline reads.
4. Run focused tests, package/app typechecks and lint, then the code-quality
   ratchet. Review the final diff for unrelated changes.

## Testing phase

- Unit tests for each changed behavior, including failure and malformed-data
  paths.
- Edge-function tests registered in the existing edge test configuration.
- Package/app typecheck, lint, and `qa:code-quality-ratchet`.
- Full relevant Vitest suite after focused tests pass.
