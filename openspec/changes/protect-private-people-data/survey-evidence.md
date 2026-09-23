# MYK9-664 applied-state survey

Read-only query against linked project `sojmvhhwsjxmfistvzbe` (updated 2026-09-22). No PII values were selected.

- `public.people` contains nullable `date_of_birth date` and non-null `junior_handler_numbers jsonb`.
- The latest live count reported 0 active people with DOB and 0 with a non-empty junior-handler map; this is not authorization evidence and must not be used to waive ACL closure.
- `people_select` is `TO authenticated` and admits the subject or argument-less `is_show_manager()`.
- `people_update` admits the subject, `can_manage_show_person(people.id)`, or a site admin. The private-table design intentionally does not reproduce the show-manager write arm.
- Table ACL grants authenticated CRUD and service-role full privileges. `has_column_privilege` confirmed authenticated SELECT is true for both legacy private columns; anonymous SELECT is false, and anon is limited to the public allowlist.
- 1,288 non-deleted entries have `handler_id`; they reference 5 distinct handlers. Relationship-scoped paperwork reads must follow entry → show → managed club rather than a nullable role helper.
- On 2026-09-22, authenticated column SELECT was confirmed true for both legacy private columns. Anonymous column SELECT was false.
- Applied migration head on 2026-09-22 was `20260922220537`; do not select a migration version based on branch history alone.

The current implementation plan separates expansion from client adoption and contract. The contract migration is the step that closes the legacy-column ACL exposure after the new client is verified live.
