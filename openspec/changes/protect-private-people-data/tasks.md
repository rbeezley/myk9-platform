## 1. Survey and Assertion-First Coverage

- [x] 1.1 Survey the applied `people` columns, values, table/column ACLs, policies, role/link tables, and every private-field read/write caller; record the evidence and verify no migration assumption is guessed
- [x] 1.2 Add red contract/behavior tests for self, related show manager, unrelated manager, exhibitor, and anonymous private-field access; verify the new expectations fail on `main`

## 2. Private Data Boundary

- [x] 2.1 Add a correctly timestamped migration for `people_private`, backfill, explicit grants/revokes, relationship-scoped RLS/helper, constraints, and rollback-safe sequencing; verify migration contract tests and the timestamp against origin/main plus linked migration history
- [x] 2.2 Move junior-handler reads and self/site-admin writes to the private relation or narrow RPC, deny show-manager writes, and verify focused hook/service/component tests pass without any broad directory query selecting private fields; do not fabricate generated types before the migration is applied
- [x] 2.3 Run a fresh read-only migration security audit covering existing rows, idempotency, recovery, grants, RLS recursion, and schema compatibility; address every finding

## 3. Verification and Delivery

- [x] 3.1 Run targeted tests, app typecheck, SQL checks, OpenSpec validation, code-quality ratchet, and the full high-risk local validation ladder; verify all required commands pass or document unrelated failures
- [ ] 3.2 Open and merge the reviewed PR with CI green, then request approval for database push, regenerate schema types from the applied database, and record applied table/column ACL plus role-scenario evidence before archiving the change
