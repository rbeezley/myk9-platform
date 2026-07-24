# Task 4.1 Inventory — Slice 3A evidence pass (2026-07-24)

Read-only inventory of the schema, guards, and mutation paths the Slice 3A
migration (design.md Decisions 7/7A) will be written against.

## 1. `is_site_admin()`

Canonical (final) definition: `supabase/migrations/156_denormalize_auth_user_id_into_user_roles.sql:106-121` —
no-arg, `SECURITY DEFINER STABLE SET search_path = ''`, checks
`user_roles.auth_user_id = auth.uid()` joined to `roles.name = 'site_admin'`
with `is_active` and unexpired `expires_at`. Lineage: renamed from
`is_platform_admin()` (mig 124), recursion-fixed (154, 155), denormalized (156).
Caller examples: `126_result_submissions.sql:26,33`, `133_secretary_tasks.sql`,
`143_scope_judge_assignments_rls.sql`, `188_premium_bridge_tables.sql:45-52`.

## 2. `people.early_adopter_until` and its write guards

Column added by `20260609233000_early_adopter_expiry.sql:9-10` (timestamptz,
nullable; replaced dropped `is_early_adopter` boolean). Two triggers share one
function `people_protect_early_adopter()`:

1. `20260609233000_early_adopter_expiry.sql:25-50` — `BEFORE UPDATE OF
early_adopter_until`; allows only `session_user='postgres'`,
   `current_setting('role',true)='service_role'`, or `is_site_admin()`; else
   raises `42501`.
2. `20260611090000_pr625_round8_write_guards.sql:56-102` — redefines the
   function (unchanged-value UPDATE no-op branch) and adds
   `people_protect_early_adopter_insert_trigger` (`BEFORE INSERT ... WHEN
(new.early_adopter_until IS NOT NULL)`), same allow-list.

Any RPC touching the legacy column must run as site admin / service_role /
postgres or the trigger blocks it.

## 3. `exhibitor_profiles`

`009_online_entry_system.sql:48-70`: `person_id → people`, unique
`auth_user_id → auth.users`, `subscription_tier` (`free|premium|pro`),
`subscription_expires_at`, `stripe_customer_id`. Exhibitor-ness = row exists.
RLS same migration lines 384-434 (own-select/update + admin-all). NOTE: this
table's `subscription_tier`/`subscription_expires_at` is the paid-state
representation, distinct from `people.early_adopter_until` and from the new
grants table. `188_premium_bridge_tables.sql` is unrelated (club templates).

## 4. RBAC schema

`005_myk9show_specific.sql:224-265`: `roles(id, name UNIQUE, ...)`,
`permissions`, `role_permissions(role_id, permission_id)`, `user_roles(id,
user_id → people, role_id, club_id NULL, show_id NULL, granted_by,
granted_at)`. Later: `064` adds `user_roles.is_active`; `156` adds
`user_roles.auth_user_id` (trigger-synced; see also `159`). site_admin
membership = active, unexpired `user_roles` row joined to
`roles.name='site_admin'` matched on `auth_user_id = auth.uid()`.

## 5. Source readers of `early_adopter_until`

| File                                                                                                                            | Use                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `hooks/useExhibitorProfile.ts`                                                                                                  | Fetches the column with a regex-based retry-without-column fallback (schema-drift defense) |
| `hooks/useSubscriptionGate.ts:31-40`                                                                                            | Client gate: `isEarlyAdopter` feeds `tier === 'premium'` — the logic Decision 6/7 replaces |
| `pages/AccountPage.sections.tsx:219`                                                                                            | Displays `foundingUntil`                                                                   |
| `pages/SubscriptionPage.tsx:13`                                                                                                 | Displays `foundingUntil`                                                                   |
| `config/features.ts:11`                                                                                                         | Comment only                                                                               |
| tests: `test/hooks/useExhibitorProfile.test.ts`, `hooks/__tests__/useSubscriptionGate.test.ts`, `test/types/user-types-test.ts` | Coverage                                                                                   |

## 6. Premium mutation paths (Decision 7A enforcement points)

| Domain         | Table                                     | Write path                                                                    | Current INSERT/UPDATE RLS                                                                   |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Vaccinations   | `vaccinations`                            | direct `supabase.from()` (`services/database/health-records/vaccinations.ts`) | `023_tighten_rls_and_add_test_helpers.sql:44-58` owner-scoped (`187` adds secretary SELECT) |
| Medications    | `medications`                             | direct (`.../medications.ts`)                                                 | `023:59-73` owner-scoped                                                                    |
| Allergies      | `allergies`                               | direct (`.../allergies.ts`)                                                   | `023:74-88` owner-scoped                                                                    |
| Vet visits     | `vet_visits`                              | direct (`.../vet-visits.ts`)                                                  | `023:89+` owner-scoped                                                                      |
| OFA            | `ofa_screenings`                          | direct (`.../ofa-screenings.ts`)                                              | `044_ofa_genetic_screenings.sql:10-56` own-rows                                             |
| Genetic        | `genetic_screenings`                      | direct (`.../genetic-screenings.ts`)                                          | `044:59-97` own-rows                                                                        |
| Training       | `training_journal_entries` (+ milestones) | direct (`services/database/training/entries.ts`)                              | `041_training_journal.sql:67-97` own-rows                                                   |
| Pedigree       | `pedigree_ancestors`                      | direct (`services/database/pedigrees/writes.ts`)                              | `043_pedigree_ancestors.sql:54-70` own-rows                                                 |
| Manual results | `result_submissions`                      | direct insert (`hooks/mutations/useResultSubmission.ts:55,80`)                | `126_result_submissions.sql:22-33` — **secretary/site-admin only, NOT owner-scoped**        |

Every health/training/pedigree table is a direct supabase-js write gated only
by ownership RLS — no premium check exists at the DB layer today. **OPEN
QUESTION for the migration author:** `result_submissions` RLS is
secretary/admin-authored; trace the actual write path used by the exhibitor
`LogManualResultPanel` before deciding where 7A's manual-result enforcement
lands.

## 7. SQL test conventions

Hand-written transactional psql scripts in `supabase/tests/*.sql`
(`BEGIN; ... ROLLBACK;`, deterministic fixture UUIDs, session switching via
`SET LOCAL role` / `request.jwt.claims`, `RAISE NOTICE 'PASS ...'`), run with
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`. Best template:
`supabase/tests/pull_refund_decision_rls_test.sql`. Separately,
`pnpm qa:rls-smoke` (`scripts/qa/rls-smoke/rls-recursion-smoke.ts`) detects
RLS recursion only — both are required, neither replaces the other.

## 8. Migration naming

Timestamp scheme `YYYYMMDDHHMMSS_description.sql` (numeric `NNN_` scheme ended
~197). Current tail: `20260723150000_prevent_duplicate_active_onboarding_requests.sql`.
New migration: pick a `20260724HHMMSS_...` name and re-check the directory tail
immediately before creating.
