# MYK9-664 applied-state survey

Read-only query against linked project `sojmvhhwsjxmfistvzbe` on 2026-09-19. No PII values were selected.

- `public.people` contains nullable `date_of_birth date` and non-null `junior_handler_numbers jsonb`.
- 19 active people rows exist; currently 0 have a date of birth and 0 have a non-empty junior-handler map.
- `people_select` is `TO authenticated` and admits the subject or argument-less `is_show_manager()`.
- `people_update` admits the subject, `can_manage_show_person(people.id)`, or a site admin. The private-table design intentionally does not reproduce the show-manager write arm.
- Table ACL grants authenticated CRUD and service-role full privileges. Anonymous access is limited by column ACL to `id`, `first_name`, `last_name`, and `email`.
- 1,288 non-deleted entries have `handler_id`; they reference 5 distinct handlers. Relationship-scoped paperwork reads must therefore be tested through entry → show → managed club rather than a nullable role helper.

Remaining before migration acceptance: complete source caller inventory, confirm the exact show/club relationship helper against current schema, and run the finished migration through a fresh auditor.
