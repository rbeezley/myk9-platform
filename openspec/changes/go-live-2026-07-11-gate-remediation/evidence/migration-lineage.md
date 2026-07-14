# Migration Lineage Evidence

**Checked:** 2026-07-11 23:29:52 UTC
**Project:** `sojmvhhwsjxmfistvzbe`
**Mutation performed:** none

## Duplicate version scan

The repository scan over every `supabase/migrations/*.sql` filename returned no duplicate version prefixes.

The remaining local lineage is:

- `20260710160000_ringside_passcode_generation_revocation_complete.sql`
- `20260710170000_soft_delete_person_deactivates_roles.sql`

`20260710160000_self_service_soft_delete_person.sql` is absent. The focused source contract separately proves that `20260710170000` preserves self-service authorization and deactivates active role grants only after a successful person soft-delete.

## Local and remote migration list

`supabase migration list` completed against the linked project. Every local version matched a remote version through `20260710170000`; there were no local-only or remote-only rows. In particular, both `20260710160000` and `20260710170000` were aligned.

## Database-push dry run

The linked-project command was run with `--dry-run`. Supabase reported:

```text
DRY RUN: migrations will *not* be pushed to the database.
Remote database is up to date.
```

## Live authoritative function definition

A redacted read-only `pg_get_functiondef('public.soft_delete_person(uuid)'::regprocedure)` query
returned definition fingerprint `6f18bcf3e66db609392177ac35d8d322`. All six required markers were
present:

- self-service authorization binds `people.auth_user_id` to `auth.uid()`;
- the function updates `public.user_roles`;
- matching role grants are set inactive;
- role deactivation is scoped to the deleted person and active grants;
- the people update captures its affected-row count; and
- the zero-row guard runs before role deactivation.

The function body and database credentials were not printed or stored.

## Conclusion

Remote migration parity, the clean dry run, the live definition fingerprint/markers, and the source
contract agree that `20260710170000` is authoritative. Removing the obsolete never-applied duplicate
requires no database push or migration-history repair. A real `supabase db push` was not run.
