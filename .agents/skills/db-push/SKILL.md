---
name: db-push
description: Use when creating or pushing Supabase database migrations, running db push, when migration push fails with password/linking errors, or when creating new migration files
---

# Database Migrations

Create and push local migrations to the hosted Supabase database. Handles numbering collisions, password issues, and linking errors.

## Creating a New Migration

### Step 1: Determine Next Number

**ALWAYS check the filesystem for the current highest number.** Never assume or cache the number — another agent or session may have created one since you last checked.

```bash
ls supabase/migrations/ | tail -1
```

The next migration number is `highest + 1`, zero-padded to 3 digits.

**Example:** If the last file is `104_announcement_push_webhook.sql`, the next is `105_your_description.sql`.

### Step 2: Create the File

```bash
# Use the number you just determined
touch "supabase/migrations/105_description_here.sql"
```

Then write the SQL content using the Write tool.

### Collision Prevention

If working in a worktree or parallel session:

1. **Before writing:** `git fetch origin main && git log origin/main -- supabase/migrations/ | head -5` to check for new migrations on remote
2. **Before committing:** Re-check `ls supabase/migrations/ | tail -1` — if someone else took your number, renumber yours
3. **If collision detected after commit:** Rename with the next available number and amend or create a fixup commit

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

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
source supabase/.env && supabase db push --password "$SUPABASE_DB_PASSWORD"
```

If you get "out of order" errors, add `--include-all`:

```bash
source supabase/.env && supabase db push --password "$SUPABASE_DB_PASSWORD" --include-all
```

### Step 3: Verify

After a successful push, confirm by checking the migration was applied. The CLI will list which migrations were applied.

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
