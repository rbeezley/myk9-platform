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
```

Then choose today's date with a **specific odd time** — `174500`, `142300`,
`151500`. Never a shared default like `120000`: two agents both reaching for the
round number is exactly how versions collide.

```bash
touch supabase/migrations/20260908174500_description_here.sql
```

Write the SQL with the Write tool. `pnpm qa:migrations:guard` enforces this in
CI — run it locally before pushing if the branch has been open more than a day.

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

-- sequence: no migration has ever GRANTed one, and a BEFORE INSERT trigger's
-- nextval() fires before RLS WITH CHECK, so a table INSERT grant dies 42501 here
select c.relname, unnest(c.relacl)::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'S' and n.nspname = 'public' and c.relname like '<table>%';
```

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
