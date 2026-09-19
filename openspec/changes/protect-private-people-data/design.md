## Context

See `proposal.md`. `people_select` deliberately supports broad operational directory search, while two recently added columns carry data that should not inherit that boundary. Existing report hydration reads those fields explicitly, and profile/admin saves currently write them through `people`.

## Goals / Non-Goals

**Goals:** separate private fields without narrowing required directory search; preserve junior-handler paperwork and self-service; prove the applied grants and RLS behavior.

**Non-Goals:** re-scope names/contact-directory fields, introduce a new UI, or deploy the migration before merge and explicit approval.

## Decisions

1. Create a one-to-one `people_private` table keyed by `person_id`, rather than changing `people_select` or adding a view. The broad directory policy is load-bearing for existing manager search; a private relation gives the two sensitive fields an independent RLS boundary without PostgREST view/embed ambiguity.
2. Authorize SELECT to the subject, site admins, and managers of a show with an entry whose `handler_id` matches the subject. Do not use argument-less role helpers. Managers receive read access for paperwork, not blanket write access.
3. Authorize writes only to the subject and site admins. Show managers receive relationship-scoped read access for paperwork but no private-field write access. If an existing client surface depends on broader writes, narrow or disable that private-field path rather than reproducing the gap.
4. Backfill values first, switch application reads/writes and generated types, then remove the old columns in the same reviewed migration only when contract tests prove no source query still references them. The migration must explicitly grant authenticated access, revoke anonymous access, and assert table and column ACLs.
5. This data is online-only identity/profile data, not show-day replicated state; no replication table is introduced.
6. Mixed public/private profile saves use a single `update_person_with_private` SECURITY DEFINER RPC. It locks the `people` row, validates explicit public/private field allowlists and caller scope, applies both patches in one transaction, and returns the merged row. Private patch keys are presence-based so an omitted field is preserved and an explicit JSON null clears it. The client never performs a read/merge/compensating rollback, and the legacy private-only RPC takes the same person-row lock for older callers.

## Risks / Trade-offs

- [Circular RLS joins through entries/people] → use a security-definer relationship helper with fixed `search_path`, row-security-aware tests, and no nullable wildcard argument.
- [Existing write flow cannot be safely authorized] → pause migration and replace it with a narrowly scoped RPC before removing old columns.
- [Partial deploy breaks old clients] → keep the migration and client changes in one release and include a rollback that restores columns from the private table.
- [Live rows differ from seed assumptions] → survey related tables and values before choosing the migration timestamp or SQL.

## Migration Plan

1. Survey live/applied schema, grants, current private values, handler relationships, and existing read/write callers.
2. Add assertion-first SQL/contract tests, then the table, backfill, policies, grants, and client/type changes.
3. Run migration guard and dry run locally. Merge before requesting `supabase db push`.
4. After approved deployment, verify table/column ACLs and role scenarios against the applied database. Roll back by restoring the old columns from `people_private` before dropping the new table.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes RLS, grants, a sensitive-data migration, and multiple identity read/write paths.
