# Nightly review fixes — 2026-07-26

## Scope

- Make the anon-grant health check compare the exact applied table/column ACL sets.
- Give signed-in favorite state a user-scoped local key, migrating anonymous state once.
- Prevent favorite reconciliation from overwriting toggles made during awaited server writes.

## Testing

- Add regression tests for unexpected and missing ACL rows.
- Add account-switch and anonymous-migration tests for favorite storage.
- Add an in-flight toggle test with a delayed server write.
- Run focused Vitest files, typecheck, lint, and the full relevant app suite.
