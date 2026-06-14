# People Deduplication Design

**Date:** 2026-04-13
**Status:** Approved
**Scope:** Single migration — no frontend changes

---

## Problem

When a secretary creates a mail-in entry, a `people` row is inserted with `auth_user_id = NULL`. If that same person later signs up using the same email address, the `on_auth_user_created` trigger always inserts a **new** `people` row, creating a duplicate. The two rows share no link, so the person's entry history, dogs, and roles are split across two identities.

---

## Solution

A single migration (131) with two parts:

### Part 1 — Unique email index

Add a partial, case-insensitive unique index on `people.email`:

```sql
CREATE UNIQUE INDEX people_email_unique
  ON public.people(LOWER(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;
```

- **Partial:** allows `NULL` email (mail-in entries without an email address can still coexist)
- **Partial:** excludes soft-deleted rows (a deleted person's email can be reused)
- **Case-insensitive:** `LOWER()` prevents `John@gmail.com` and `john@gmail.com` from being treated as different

### Part 2 — Updated `handle_new_user` trigger

Replace the existing `handle_new_user` function with a version that checks for an existing `people` row before inserting:

**If a row with the same email already exists (`auth_user_id IS NULL`):**

1. `UPDATE people SET auth_user_id = NEW.id, first_name, last_name, phone, updated_at` — signup form data is considered more authoritative than the secretary's entry
2. `INSERT INTO exhibitor_profiles (person_id, auth_user_id)` — only if no profile exists yet
3. `INSERT INTO user_roles (user_id, role_id)` for the exhibitor role — only if not already assigned
4. Skip the `INSERT INTO people`

**If no matching row exists:**

- Existing behavior: `INSERT INTO people`, `INSERT INTO exhibitor_profiles`, `INSERT INTO user_roles`

---

## What is NOT updated on link

- Address fields (street, city, state, zip) — secretary's data may be more complete than signup form
- Existing roles beyond exhibitor — preserved as-is
- Dogs, entries, enrollments — all linked via `people.id` which doesn't change

---

## Edge cases

| Scenario                                       | Behavior                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Signup email is NULL                           | Impossible — Supabase Auth requires a valid email                                                                                   |
| Existing person has `auth_user_id` already set | Should not occur after the unique index is in place; if it somehow does, the UPDATE is a no-op (same value written)                 |
| Existing person is soft-deleted                | Partial index excludes soft-deleted rows, so signup creates a new `people` row (correct — the deleted record is intentionally gone) |
| Signup email differs only in case              | `LOWER()` comparison matches; row is linked                                                                                         |

---

## Migration

**File:** `supabase/migrations/131_deduplicate_people_on_signup.sql`

**Steps:**

1. `CREATE UNIQUE INDEX people_email_unique ...`
2. `CREATE OR REPLACE FUNCTION public.handle_new_user() ...` with the email-check branch

No data migration required (single-user system, no existing duplicates).

---

## Testing

- Verify the unique index is created and enforced (attempt duplicate email insert, expect constraint error)
- Verify trigger links an existing person: insert a `people` row with email X and `auth_user_id NULL`, simulate an `auth.users` insert with email X, assert the existing row gets `auth_user_id` set and no new row is created
- Verify trigger still creates a new row when no existing person matches
- Verify soft-deleted person with the same email does NOT get linked (new row created)
