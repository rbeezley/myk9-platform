# Volunteer and steward writes: scope to the show (MYK9-2333)

> **Status:** Active

Design only. No migration and no code in this PR. The issue's premise mostly does not hold on current `origin/main` (152771356); the one real gap is much smaller than filed.

## Current policies, and why

| Table                         | Write policy today                                                                                                            | Origin                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `volunteers`                  | `volunteers_manage_insert/update/delete`: `can_manage_show(show_id)`; update has it in both `USING` and `WITH CHECK`          | `20260728132000_split_catalog_volunteer_manage_read_rls.sql` (MYK9-112) split the `FOR ALL` policy from migration 100 |
| `volunteer_class_assignments` | `..._manage_insert/update/delete`: `can_manage_show(volunteer_show_id(volunteer_id))`; update checks `USING` and `WITH CHECK` | same migration                                                                                                        |

History: migration 095 created `Secretary can manage ...` policies that only checked "is a secretary anywhere". Migration 100 dropped them and replaced them with `can_manage_show()`, adding `volunteer_show_id()` because assignments have no `show_id`. Migration 101 dropped dashboard-created unscoped `*_manage` policies. The migration 095 lines the issue cites (about 49-80) were removed by 100 long ago, and the 20260728 lines it cites are the scoped policies, not the gap. `can_manage_show` is the current rule (platform admin, the club's admin per MYK9-1886, or the club's trial secretary).

## Reproduced gap

Not run live (no database in this session); read from the policy text. Cross-show writes on `volunteers` and on the volunteer side of assignments are refused already: a secretary of show A cannot insert, update or delete a volunteer of show B, nor an assignment hanging off one. Moving a volunteer to B fails the `WITH CHECK` on `show_id`.

The remaining hole is the **class side** of the "same show" criterion. The assignment policies check only the volunteer's show. Nothing checks that `class_id` belongs to that show (the foreign key points at `classes` only). A secretary of A can insert an assignment tying her own volunteer (show A) to a class of show B, if she knows the class UUID. Effect: a steward name appears against B's class on B's class views. Nothing in B is overwritten or deleted, and she cannot remove it once B's secretary clears it. Low severity, hand-made API call, UUID required.

There is also no behavioral SQL test for any of this: the existing volunteer tests (`myk9_660_667_...`) cover only `volunteer_roles`.

## Proposed policy shape

1. New `SECURITY DEFINER`, `STABLE`, `search_path = ''` helper `public.class_show_id(uuid)` (class to trial to show; confirm the join columns against the applied schema first), `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated, service_role`. Same shape as `volunteer_show_id`.
2. Replace the assignment insert and update policies' check with `can_manage_show(volunteer_show_id(volunteer_id)) AND class_show_id(class_id) = volunteer_show_id(volunteer_id)`. Delete stays as is: removing a row you manage the volunteer for is right, and it lets A clean up a stray cross-show row of her own.
3. `volunteers` policies unchanged. No grant changes (no new table); verify with `pg_class.relacl` after the push.
4. Behavioral test under `supabase/tests/`: secretaries of shows A and B; each refused on the other's show for insert, update and delete on both tables, plus the cross-show class case and a same-show success control. Runs only in CI; the live check after `supabase db push` is a separate step for the owner.

The pre-existing rows need a query first: any assignment where `class_show_id(class_id)` differs from `volunteer_show_id(volunteer_id)` would be left alone by the policy but should be listed.

## Do nothing or delete, weighed

- **Do nothing:** acceptable for the filed claim, since it is already fixed. For the class-side gap the harm is a cosmetic steward name on another club's class, with no data loss, money, or show-day block. The gap fails the "real user could plausibly hit it" bar in CLAUDE.md for filing as a bug.
- **Delete the feature:** no. Steward assignment (MYK9-2328) is a live surface and the volunteer tables are the existing home for it.
- **Recommendation:** close the filed claim as already fixed. Do the small class-scope change only as a cheap hardening alongside the next migration, or skip it; it needs the owner's call because it adds a migration. The behavioral test is worth adding either way, since nothing covers these policies today.

## Testing phase

- Before any migration: query the applied database for cross-show assignment rows and read the `classes`/`trials` join columns.
- Add the behavioral SQL test above (CI only), then `pnpm qa` checks that register it.
- After `db push`: verify policies in `pg_policies` and grants in `pg_class.relacl`.
