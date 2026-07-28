---
name: supabase-health-drift-audit
description: Performs a repository-specific, read-only Supabase audit covering migration and function drift, RLS/grants, query and index health, connections, maintenance, advisors, and recovery evidence. Use for scheduled Supabase health checks, database drift reviews, or pre-launch database posture assessment.
---

# Supabase Health and Drift Audit

Use `quality-finding-lifecycle` for finding handling and
`supabase-postgres-best-practices` for database analysis. This is an audit-only skill.

## Preconditions

Read `AGENTS.md`, the fall-2026 goal and scorecard, the go-live runbook, launch QA checklist,
recent database/security reports, current main changes, and prior automation memory. Resolve the
linked project from repository configuration; never invent an environment or credential.

Use hosted access only when the configured read-only operation and credentials are available.
Missing access is `blocked`, not clean. Redact credentials, tokens, PII, connection strings, and
sensitive query text.

## Existing checks

Run or assess the narrowest applicable repository commands:

- `pnpm qa:db-drift:test`
- `pnpm qa:db-drift:enum`
- `pnpm qa:db-drift:functions`
- `pnpm qa:advisor-inventory` with current, properly obtained advisor inputs
- `pnpm qa:rls-smoke`
- relevant read-only `qa:go-live:*` checks

Stop a command that hangs or makes no useful progress for more than 60 seconds. Record prerequisites,
baseline SHA, command, result, and coverage limits.

## Audit passes

1. **Drift:** compare repository and hosted migrations, functions, enums, constraints, grants,
   extensions, configuration assumptions, and scheduled jobs.
2. **Security/RLS:** inspect RLS and required FORCE RLS, policy scope, anon/auth/service grants,
   cross-club/show isolation, SECURITY DEFINER authorization/search paths, recursion, and indexed
   policy predicates.
3. **Query/schema:** find missing FK/filter/join indexes, critical sequential-scan risks, duplicate
   or suspicious unused indexes, constraint/type mismatches, and unsafe query patterns.
4. **Operations:** review available slow/frequent-query, connection, lock/deadlock, dead-tuple,
   statistics freshness, growth, replication/realtime, and Edge Function health signals.
5. **Recovery:** verify current evidence for backups/PITR, retention, RPO/RTO, a performed restore,
   and single-show partial recovery required by go-live gate G8.
6. **Advisors:** separate repository-owned actionable findings from platform-managed,
   extension-owned, accepted, duplicate, and inconclusive entries.

## Hard read-only boundary

Never execute DDL/DML; apply/revert migrations; deploy functions; change database, auth, storage,
realtime, cron, or project settings; reset statistics; run VACUUM/ANALYZE; alter indexes/policies;
rotate secrets; trigger money movement; or perform a restore. Do not run `EXPLAIN ANALYZE` on
mutations or expensive hosted queries. Any remediation or restore rehearsal requires a separate,
explicitly approved task.

## Report

Return database confidence and trend; checks/sources; drift; RLS/security; performance/capacity;
function/job health; recovery evidence; advisor transitions; ranked findings; Linear drafts awaiting
approval; blocked checks; and next actions. Update the compact lifecycle ledger in automation memory.

Example invocation: “Use `supabase-health-drift-audit` against the configured staging project.”
