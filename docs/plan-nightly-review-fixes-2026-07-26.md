# Nightly review fixes — 2026-07-26

> **Status:** Active

## Scope

- Make the anon-grant health check compare the exact applied table/column ACL sets.
- Give signed-in favorite state a user-scoped local key, migrating anonymous state once.
- Prevent favorite reconciliation from overwriting toggles made during awaited server writes.

## Testing

- Add regression tests for unexpected and missing ACL rows.
- Add account-switch and anonymous-migration tests for favorite storage.
- Add an in-flight toggle test with a delayed server write.
- Focused Vitest files, typecheck, lint, and diff check pass.
- Attempt the full relevant app suite; the local run was stopped after more than
  60 seconds without useful progress, per `AGENTS.md`. CI is the broad-suite
  gate.
