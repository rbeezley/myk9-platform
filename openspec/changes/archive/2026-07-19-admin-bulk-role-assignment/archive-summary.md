# Archive Summary — admin-bulk-role-assignment (MYK9-58)

Implemented and merged before archive, per the archive gate in `openspec/config.yaml`.

- **Implementation PR:** https://github.com/rbeezley/myk9-platform/pull/1404 — squash-merged to `main` as `66a0a33a4` on 2026-07-19. All checks green at merge (Quality Checks, Build, myK9Show test shards + coverage gate, Test packages, SQL tests, E2E PR Smoke, A11y smoke); one shard-3 failure earlier in the run was the known-flaky AskQPanel suite and passed on re-run.
- **Second opinion:** Codex review pre-merge — three P2s (stale admin list + stuck selection after role batches, Replace not repairing the locked exhibitor role, clubs-query failure dead-ending the scoped flow), all fixed with tests; orchestrator added partial-success list invalidation.
- **Browser verification:** not performable — the dev seed has no `site_admin` login and the admin Users page is site_admin-gated (recorded in the archived tasks.md); covered by 170 component/hook tests and service-call parity with the shipped single-user ManageUserRolesDialog.
- **Linear:** MYK9-58 flipped Done on merge.
- **Main specs:** one requirement added to `openspec/specs/bulk-selection-actions/` at archive time (canonical, scope-aware, honest bulk role assignment).
