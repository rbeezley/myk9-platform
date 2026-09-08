---
name: db-push
description: Use when creating or pushing Supabase database migrations, running db push, when migration push fails with password/linking errors, or when creating new migration files
---

# Database Migrations

Create and push local migrations to the hosted Supabase database. Handles version
selection, password issues, and linking errors.

`deploy` delegates here for the push procedure; this skill owns migration
authoring and the password/linking mechanics.

## Creating a New Migration

### Step 1: Pick the version

Migrations are named `<version>_<description>.sql`, where the version is a
**14-digit UTC timestamp**: `YYYYMMDDHHMMSS`. (Files numbered `NNN_` are the
pre-2026 convention — read them, never extend them.)

Pick the version against **`origin/main` AND the linked database**, never against
your own branch. A version another PR merges first dies at
`INSERT INTO supabase_migrations.schema_migrations`, and a branch that has been
open a while will have gone stale — re-check before pushing.

```bash
git fetch origin main
git ls-tree -r --name-only origin/main -- supabase/migrations | tail -5
supabase migration list   # what the linked DB has actually applied

# Neither of the above sees an unmerged branch that already took your version.
# Ask GitHub for the files, not git: a PR head may not be fetched locally, and a
# fork PR has no origin/<branch> ref at all — `git ls-tree origin/<head>` would
# fail silently and the sweep would report a clean miss.
pnpm qa:inflight supabase/migrations
gh pr list --state open --limit 200 --json number --jq '.[].number' \
  | xargs -I{} gh pr view {} --json files --jq '.files[].path' \
  | grep '^supabase/migrations/' | sort -u
```

Then choose today's date with a **specific odd time** — `174500`, `142300`,
`151500`. Never a shared default like `120000`: two agents both reaching for the
round number is exactly how versions collide.

```bash
touch supabase/migrations/20260908174500_description_here.sql
```

Write the SQL with the Write tool.

`pnpm qa:migrations:guard` runs in CI but does **not** check the format — its
`^(\d+)_` match accepts any numeric prefix, so a `105_name.sql` passes it. What
it does catch is version _collision and provenance_: two files claiming one
version, a version already claimed on `origin/main` or another ref, and an edit
to a migration body that `main` or the merge base already accepted. Nothing
enforces the timestamp shape; that one is on you.

Run the guard locally before every push, not only on a long-lived branch — two
agents can pick the same version the same afternoon, and the guard is what
catches it. Pass the base explicitly:

```bash
source supabase/.env
GITHUB_BASE_REF=main \
MYK9_MIGRATION_DATABASE_URL=postgresql://postgres.sojmvhhwsjxmfistvzbe@aws-1-us-east-2.pooler.supabase.com:5432/postgres \
PGPASSWORD="$SUPABASE_DB_PASSWORD" \
  pnpm qa:migrations:guard
```

Both variables are load-bearing, and neither failure is loud:

- Without `GITHUB_BASE_REF` the guard diffs only `HEAD^..HEAD`, so one more
  commit after the migration — a docs commit is enough — and it passes
  **without ever looking at the migration**.
- Without `MYK9_MIGRATION_DATABASE_URL` it throws as soon as a migration is in
  range: the deployed-version check shells out to `psql` to count
  `supabase_migrations.schema_migrations`. Requires `psql` on PATH. These are
  the same values CI passes (`.github/workflows/ci.yml`, "Migration version
  guard").

### Step 2: Grants are not optional

Every `CREATE TABLE public.<name>` needs explicit `GRANT`s, and a table that
should exclude `anon` needs an explicit `REVOKE` — this project carries
`ALTER DEFAULT PRIVILEGES` granting `anon` full CRUD on every newly created
table, so omitting a grant does **not** keep `anon` out. See CLAUDE.md
§ Database Migrations for the template and the post-push verification queries
(`pg_class.relacl` **and** `pg_attribute.attacl`; sequences too).

Before writing a migration that references existing rows (permissions, roles,
enum values), query the target table first to confirm those values exist.

Consider dispatching the `migration-auditor` agent on the finished file.

---

## Pushing Migrations

### Step 1: Verify Project Link

```bash
cat supabase/.temp/project-ref 2>/dev/null
```

Expected: `sojmvhhwsjxmfistvzbe`

If missing or wrong, re-link:

```bash
supabase link --project-ref sojmvhhwsjxmfistvzbe
```

This will prompt for the database password. The password is in `supabase/.env` as `SUPABASE_DB_PASSWORD`. If the password in `.env` doesn't work during linking, ask the user to reset it in the Supabase dashboard (Project Settings > Database > Database password) and update `supabase/.env`.

### Step 2: Push Migrations

Run this from the worktree linked to Supabase — **not** the main repo, and
never from an unmerged branch.

```bash
source supabase/.env && supabase db push --password "$SUPABASE_DB_PASSWORD"
```

If you get "out of order" errors, add `--include-all`:

```bash
source supabase/.env && supabase db push --password "$SUPABASE_DB_PASSWORD" --include-all
```

### Step 3: Verify against the applied database

The CLI lists what it applied. That is not proof the migration did what it meant
to — verify grants against the **database**, never against the migration text.

```bash
supabase migration list   # remote now matches supabase/migrations/
```

For a migration that created a table or changed access, run all three ACL checks
against the live DB — table, column, and sequence. CLAUDE.md § Database
Migrations carries the first two; the sequence query is not written down there,
so it is inlined here:

```sql
-- table
select unnest(relacl)::text from pg_class where oid = 'public.<table>'::regclass;

-- column (a blanket REVOKE drops these silently and relacl will not show it)
select a.attname, unnest(a.attacl)::text
from pg_attribute a
where a.attrelid = 'public.<table>'::regclass and a.attacl is not null;

-- sequences owned by the table (identity / serial columns)
select s.relname, unnest(s.relacl)::text
from pg_class s
join pg_depend d on d.classid = 'pg_class'::regclass and d.objid = s.oid
join pg_class t on t.oid = d.refobjid
where s.relkind = 'S' and t.oid = 'public.<table>'::regclass;
```

A BEFORE INSERT trigger's `nextval()` fires before RLS `WITH CHECK`, so a table
INSERT grant dies 42501 on the sequence — RLS never gets to mask it.

**The ownership query above does not find every sequence that matters.** A
standalone sequence a trigger calls has no `pg_depend` link to its table:
`registration_confirmation_seq` is reached from `enrollments` through
`generate_confirmation_number()`, and it was created three renames ago in
`054_registrations_table.sql`, so it appears in neither the ownership join, a
name-prefix match, nor the text of the migration you are pushing.

Do not try to resolve reachability. This schema has four public sequences
(verified 2026-09-08) — list them all and eyeball the one you touched:

```sql
select c.relname, coalesce(array_to_string(c.relacl, E'\n'), '(owner only)')
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'S' and n.nspname = 'public'
order by c.relname;
```

Assume a sequence is ungranted until this output says otherwise — only
`20260730220000_codify_pre_rule_table_grants.sql` has ever GRANTed one.

Do not use `information_schema.role_table_grants` — it only shows grants visible
to the querying role and returns empty over the MCP connection, so it cannot
prove absence. Then run `get_advisors` (Supabase MCP) to catch new RLS/security
warnings.

## Common Errors

| Error                                | Fix                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `password authentication failed`     | Password in `supabase/.env` is stale. User must reset in Supabase dashboard and update the file.                                                    |
| `project ref not found` / not linked | Run `supabase link --project-ref sojmvhhwsjxmfistvzbe`                                                                                              |
| `out of order migration`             | Add `--include-all` flag                                                                                                                            |
| `connection refused` / IPv6 timeout  | User's network doesn't support IPv6. The session pooler (IPv4) should be used automatically when linked. If not, check `supabase/.temp/pooler-url`. |
| `migration already applied`          | Safe to ignore — migration was already pushed previously                                                                                            |

## Important Notes

- **Password location:** `supabase/.env` (NOT root `.env`), variable `SUPABASE_DB_PASSWORD`
- **Always source the env file** — never hardcode or type the password
- **IPv4 only:** User's network requires the session pooler endpoint, not direct connection
- **Project ref:** `sojmvhhwsjxmfistvzbe`
