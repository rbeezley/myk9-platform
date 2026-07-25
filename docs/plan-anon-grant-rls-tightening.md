# Anon grant & RLS tightening (MYK9-93)

> **Status:** Active

Launch gate. Closes [MYK9-93](https://linear.app/myk9-platform/issue/MYK9-93/anon-rlsgrant-audit-tighten-permissive-select-policies-before-launch).
Pre-launch, no real users — nothing is currently at risk.

## Problem

`ALTER DEFAULT PRIVILEGES` in schema `public` grants **anon** `arwdDxtm` on every newly
created table, from both the `postgres` and `supabase_admin` grantors (verified via
`pg_default_acl`). Consequence: **omitting a `GRANT` does not withhold access**, so all 54
public tables give anon full CRUD and RLS is the only protecting layer. This is Supabase's
stock pre-Oct-2026 default for projects of this vintage, not something a past migration did.

Discovered 2026-07-25 on `dog_favorites`, which shipped with anon holding full privileges
despite the migration deliberately granting it none.

## Corrections to the issue text (verified against the applied DB)

| Issue claim | Reality |
| -- | -- |
| "`entries` correctly has no anon SELECT" | **False.** `entries_anon_select_for_tv` grants anon SELECT on entries for any show in status `published`/`upcoming`/`in_progress`/`completed`. Deliberate — it backs the TV / at-show boards. |
| `nationals_*` need reconciling with the release gate | They have **zero application callers** (they appear only in generated `database.types.ts`). Delete the anon SELECT outright rather than scope it. |
| Scope items 4 & 5 (migration template, `CLAUDE.md`) | Already shipped in `ba55179da`. |

## Anon-reachable surface (derived: policy `USING` satisfiable with `auth.uid()` null)

**SELECT — 21 tables, all deliberate public reference / show data.** These keep an explicit
`GRANT SELECT ... TO anon` after the blanket revoke:

`achievements`, `armbands`, `class_visibility_overrides`, `classes`, `clubs`, `entries`,
`judge_assignments`, `rule_organizations`, `rule_sports`, `rulebooks`, `rules`,
`show_templates`, `show_visibility_settings`, `shows`, `sport_class_rules`,
`sport_templates`, `sport_titles`, `template_fields`, `trial_visibility_overrides`,
`trials`, `user_guide`

**INSERT — 1 table.** `platform_waitlist` (`anon_can_insert_waitlist`, email-shape validated).

**Everything else on role `{public}` is gated by `auth.uid()`** and is therefore
authenticated-only in practice, despite the missing `TO authenticated` clause. `{public}` is
a Postgres role, not a synonym for anon.

**Views.** 9 of 11 public views are `security_invoker = true`, so they need base-table grants
for the *caller*; anon's RLS already returns nothing from them. `view_public_entry_results`
is the definer-rights release gate and keeps anon SELECT. `view_authenticated_entry_results`
already carries anon ACL `awdDxtm` — no `r` — and stays that way.

## Findings to fix

| Table | Policy | Exposed to anon | Rows |
| -- | -- | -- | -- |
| `dog_registrations` | `dog_registrations_select USING (true)` | `registration_number`, `certificate`, `registered_name`, `breed`, `status` | 8 (demo) |
| `judge_certifications` | `judge_certifications_select USING (true)` | `certification_number`, `person_id`, `expiration_date` | 0 |
| `nationals_scores` / `_rankings` / `_advancement` | `*_select USING (true)` | full score / ranking rows | 0 |

No application code path requires anon access to any of them: every `dog_registrations` read
arrives through a `dog:dog_id(...)` join and `dogs_select` is `{authenticated}` only; the
`nationals_*` tables have no callers.

## Phases

### Phase 1 — Policy tightening

1. `dog_registrations_select` → `TO authenticated`, `USING (EXISTS (SELECT 1 FROM dogs d WHERE d.id = dog_registrations.dog_id))`.
   Delegates to `dogs_select`, so registration visibility exactly tracks dog visibility
   (owner / co-owner / show manager / handler) with no duplicated predicate. Not recursive —
   `dogs_select` does not reference `dog_registrations`.
2. `judge_certifications_select` → `TO authenticated`, `USING (is_show_manager() OR is_site_admin() OR person_id = get_my_person_id())`.
3. `nationals_{scores,rankings,advancement}_select` → dropped. The existing `*_manage` `ALL`
   policy already covers club admin / trial secretary / platform admin reads.
4. `COMMENT ON POLICY` for each of the remaining deliberate `USING (true)` public SELECTs,
   stating why it is public, so the next audit does not re-litigate them.

### Phase 2 — Grant layer

1. `ALTER DEFAULT PRIVILEGES ... REVOKE ALL ON TABLES FROM anon` for **both** grantors
   (`postgres` and `supabase_admin`), plus the same for `SEQUENCES` and `FUNCTIONS`.
   Makes omission of a `GRANT` actually withhold access for future tables.
2. `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`.
3. Re-`GRANT SELECT` on the 21 tables above, `GRANT INSERT` on `platform_waitlist`, and
   `GRANT SELECT` on `view_public_entry_results`.
4. Leave `authenticated` and `service_role` untouched — out of scope, and both are gated by
   RLS on every table.

### Phase 3 — Testing

A phase is not complete until its tests pass.

1. **Live anon probe from a cold session** (per `feedback_verify_anon_in_cold_session`):
   direct PostgREST reads with the publishable key, asserting 200 + rows for the 21 allowed
   tables and 401/403/empty for `dog_registrations`, `judge_certifications`, `nationals_*`,
   `dogs`, `people`.
2. **SQL assertions on the applied DB**, not the migration text
   (`select unnest(relacl)::text from pg_class where oid = 'public.<t>'::regclass`) —
   `information_schema.role_table_grants` returns empty over MCP and cannot prove absence.
3. **Regression**: at-show / TV board and the public show-detail pages still load anonymously.
4. `pnpm typecheck`, `pnpm lint`, and the myk9show unit suite.

### Phase 4 — Ship

Migration + plan in one PR. Codex review before merge (gates + RLS → review is a gate).
Confirm before `supabase db push` — shared-system write.

## Risks

- **Blanket revoke over-reaches.** Mitigated by deriving the keep-list from policy predicates
  rather than guessing, and by the cold-session probe in Phase 3.
- **`security_invoker` views.** Revoking base grants turns a silently-empty view into a hard
  permission error for anon. Accepted: anon has no UI path to those stats views, and the
  release gate is a definer view.
- **Seed / e2e fixtures using the anon key for writes.** Phase 3's suite run catches this.
