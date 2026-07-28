# MYK9-113 index hygiene evidence

## Baseline

- Project: `sojmvhhwsjxmfistvzbe`
- Captured: 2026-07-28 18:34:52 UTC
- Database: PostgreSQL 17.6
- Data shape: pre-launch; 36 entries, 24 classes, 17 trials, 16 shows
- Advisor-compatible uncovered FKs: 52
- Strict uncovered FKs: 78
- Zero-scan public indexes: 147
- Exact duplicate groups: 2 (2 redundant indexes)
- Historical issue baseline (2026-07-26): 58 uncovered FKs, 103 advisor unused-index
  findings, 2 duplicate groups, and 222 raw zero-scan indexes

The strict FK definition requires a valid, ready, non-partial index whose leading key is the FK
column. The issue's subset query is also recorded because it matches the original baseline, but it
can treat a partial or non-leading index as coverage. All 216 live public foreign keys are
single-column constraints.

The scan statistics are a timestamped observation, not a deletion signal. MYK9-109's realistic
load fixture and rehearsal have not run, so all non-duplicate query indexes remain in place.

## Reproduction queries

Advisor-compatible uncovered FK count:

```sql
select c.conrelid::regclass as table_name, c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where c.contype = 'f'
  and n.nspname = 'public'
  and not exists (
    select 1
    from pg_index i
    where i.indrelid = c.conrelid
      and i.indisvalid
      and i.indisready
      and c.conkey::int[] <@ i.indkey::int[]
  );
```

Strict uncovered FK count:

```sql
select c.conrelid::regclass as table_name, c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where c.contype = 'f'
  and n.nspname = 'public'
  and not exists (
    select 1
    from pg_index i
    where i.indrelid = c.conrelid
      and i.indisvalid
      and i.indisready
      and i.indpred is null
      and (i.indkey::smallint[])[0:cardinality(c.conkey) - 1] @> c.conkey
  );
```

Zero-scan indexes:

```sql
select relname, indexrelname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)),
       pg_get_indexdef(indexrelid)
from pg_stat_user_indexes
where schemaname = 'public' and idx_scan = 0
order by relname, indexrelname;
```

Exact duplicates compare table, uniqueness/exclusion flags, keys, operator classes, collations,
options, expressions, and predicates. Primary-key identity and index names are deliberately not
part of the physical signature.

## Strict uncovered foreign keys

| Table                           | Constraint                                                  | FK column              | Definition                                                                                      |
| ------------------------------- | ----------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| analytics_events                | analytics_events_user_id_fkey                               | user_id                | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE                               |
| chatbot_feedback                | chatbot_feedback_query_log_id_fkey                          | query_log_id           | FOREIGN KEY (query_log_id) REFERENCES chatbot_query_log(id) ON DELETE CASCADE                   |
| chatbot_feedback                | chatbot_feedback_user_id_fkey                               | user_id                | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL                              |
| chatbot_query_log               | chatbot_query_log_user_id_fkey                              | user_id                | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL                              |
| class_visibility_overrides      | class_visibility_overrides_updated_by_fkey                  | updated_by             | FOREIGN KEY (updated_by) REFERENCES auth.users(id)                                              |
| classes                         | classes_deleted_by_fkey                                     | deleted_by             | FOREIGN KEY (deleted_by) REFERENCES auth.users(id)                                              |
| classes                         | classes_results_released_by_fkey                            | results_released_by    | FOREIGN KEY (results_released_by) REFERENCES auth.users(id)                                     |
| club_access_requests            | club_access_requests_approved_club_id_fkey                  | approved_club_id       | FOREIGN KEY (approved_club_id) REFERENCES clubs(id) ON DELETE SET NULL                          |
| club_access_requests            | club_access_requests_requester_person_id_fkey               | requester_person_id    | FOREIGN KEY (requester_person_id) REFERENCES people(id) ON DELETE CASCADE                       |
| club_access_requests            | club_access_requests_reviewed_by_fkey                       | reviewed_by            | FOREIGN KEY (reviewed_by) REFERENCES people(id) ON DELETE SET NULL                              |
| clubs                           | clubs_deleted_by_fkey                                       | deleted_by             | FOREIGN KEY (deleted_by) REFERENCES auth.users(id)                                              |
| dog_favorites                   | dog_favorites_show_id_fkey                                  | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE                                    |
| dogs                            | dogs_deleted_by_fkey                                        | deleted_by             | FOREIGN KEY (deleted_by) REFERENCES auth.users(id)                                              |
| enrollments                     | registrations_handler_id_fkey                               | handler_id             | FOREIGN KEY (handler_id) REFERENCES people(id) ON DELETE CASCADE                                |
| entries                         | entries_deleted_by_fkey                                     | deleted_by             | FOREIGN KEY (deleted_by) REFERENCES auth.users(id)                                              |
| entries                         | entries_promo_code_id_fkey                                  | promo_code_id          | FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE SET NULL                       |
| entries                         | entries_refund_decided_by_fkey                              | refund_decided_by      | FOREIGN KEY (refund_decided_by) REFERENCES auth.users(id) ON DELETE SET NULL                    |
| frontend_logs                   | frontend_logs_user_id_fkey                                  | user_id                | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL                              |
| manual_results                  | manual_results_sport_template_id_fkey                       | sport_template_id      | FOREIGN KEY (sport_template_id) REFERENCES sport_templates(id)                                  |
| onboarding_requests             | onboarding_requests_auth_user_id_fkey                       | auth_user_id           | FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)                                            |
| operator_alerts                 | operator_alerts_resolved_by_fkey                            | resolved_by            | FOREIGN KEY (resolved_by) REFERENCES auth.users(id)                                             |
| paperwork_prints                | paperwork_prints_class_id_fkey                              | class_id               | FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE                                 |
| paperwork_prints                | paperwork_prints_show_id_fkey                               | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE                                    |
| paperwork_prints                | paperwork_prints_trial_id_fkey                              | trial_id               | FOREIGN KEY (trial_id) REFERENCES trials(id) ON DELETE CASCADE                                  |
| pedigree_ancestors              | pedigree_ancestors_linked_dog_id_fkey                       | linked_dog_id          | FOREIGN KEY (linked_dog_id) REFERENCES dogs(id) ON DELETE SET NULL                              |
| people                          | people_deleted_by_fkey                                      | deleted_by             | FOREIGN KEY (deleted_by) REFERENCES auth.users(id)                                              |
| platform_settings               | platform_settings_updated_by_fkey                           | updated_by             | FOREIGN KEY (updated_by) REFERENCES people(id) ON DELETE SET NULL                               |
| premium_generations             | premium_generations_show_id_fkey                            | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE                                    |
| premium_generations             | premium_generations_template_id_fkey                        | template_id            | FOREIGN KEY (template_id) REFERENCES club_premium_templates(id) ON DELETE SET NULL              |
| promo_codes                     | promo_codes_show_id_fkey                                    | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE                                    |
| result_submissions              | result_submissions_show_id_fkey                             | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE                                    |
| result_submissions              | result_submissions_submitted_by_fkey                        | submitted_by           | FOREIGN KEY (submitted_by) REFERENCES people(id)                                                |
| result_submissions              | result_submissions_trial_id_fkey                            | trial_id               | FOREIGN KEY (trial_id) REFERENCES trials(id) ON DELETE CASCADE                                  |
| ringside_sessions               | ringside_sessions_show_passcode_id_fkey                     | show_passcode_id       | FOREIGN KEY (show_passcode_id) REFERENCES show_passcodes(id) ON DELETE SET NULL                 |
| role_requests                   | role_requests_club_id_fkey                                  | club_id                | FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL                                   |
| role_requests                   | role_requests_reviewed_by_fkey                              | reviewed_by            | FOREIGN KEY (reviewed_by) REFERENCES people(id) ON DELETE SET NULL                              |
| role_requests                   | role_requests_show_id_fkey                                  | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL                                   |
| secretary_tasks                 | secretary_tasks_assignee_id_fkey                            | assignee_id            | FOREIGN KEY (assignee_id) REFERENCES people(id) ON DELETE SET NULL                              |
| secretary_tasks                 | secretary_tasks_club_id_fkey                                | club_id                | FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE                                    |
| secretary_tasks                 | secretary_tasks_created_by_fkey                             | created_by             | FOREIGN KEY (created_by) REFERENCES people(id)                                                  |
| secretary_tasks                 | secretary_tasks_show_id_fkey                                | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL                                   |
| show_announcements              | show_announcements_author_id_fkey                           | author_id              | FOREIGN KEY (author_id) REFERENCES auth.users(id)                                               |
| show_incidents                  | show_incidents_class_id_fkey                                | class_id               | FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL                                |
| show_incidents                  | show_incidents_created_by_fkey                              | created_by             | FOREIGN KEY (created_by) REFERENCES auth.users(id)                                              |
| show_incidents                  | show_incidents_dog_id_fkey                                  | dog_id                 | FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE SET NULL                                     |
| show_incidents                  | show_incidents_entry_id_fkey                                | entry_id               | FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE SET NULL                                |
| show_incidents                  | show_incidents_handler_id_fkey                              | handler_id             | FOREIGN KEY (handler_id) REFERENCES people(id) ON DELETE SET NULL                               |
| show_incidents                  | show_incidents_judge_id_fkey                                | judge_id               | FOREIGN KEY (judge_id) REFERENCES people(id) ON DELETE SET NULL                                 |
| show_incidents                  | show_incidents_trial_id_fkey                                | trial_id               | FOREIGN KEY (trial_id) REFERENCES trials(id) ON DELETE SET NULL                                 |
| show_lifecycle_email_attempts   | show_lifecycle_email_attempts_attempted_by_fkey             | attempted_by           | FOREIGN KEY (attempted_by) REFERENCES auth.users(id) ON DELETE SET NULL                         |
| show_lifecycle_email_attempts   | show_lifecycle_email_attempts_email_log_id_fkey             | email_log_id           | FOREIGN KEY (email_log_id) REFERENCES email_log(id) ON DELETE SET NULL                          |
| show_lifecycle_email_jobs       | show_lifecycle_email_jobs_correction_for_job_id_fkey        | correction_for_job_id  | FOREIGN KEY (correction_for_job_id) REFERENCES show_lifecycle_email_jobs(id) ON DELETE SET NULL |
| show_lifecycle_email_jobs       | show_lifecycle_email_jobs_created_by_fkey                   | created_by             | FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL                           |
| show_lifecycle_email_jobs       | show_lifecycle_email_jobs_email_log_id_fkey                 | email_log_id           | FOREIGN KEY (email_log_id) REFERENCES email_log(id) ON DELETE SET NULL                          |
| show_lifecycle_email_jobs       | show_lifecycle_email_jobs_enrollment_id_fkey                | enrollment_id          | FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE                        |
| show_lifecycle_email_jobs       | show_lifecycle_email_jobs_entry_id_fkey                     | entry_id               | FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE                                 |
| show_lifecycle_email_jobs       | show_lifecycle_email_jobs_recipient_person_id_fkey          | recipient_person_id    | FOREIGN KEY (recipient_person_id) REFERENCES people(id) ON DELETE SET NULL                      |
| show_lifecycle_email_jobs       | show_lifecycle_email_jobs_show_id_fkey                      | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE                                    |
| show_lifecycle_email_jobs       | show_lifecycle_email_jobs_updated_by_fkey                   | updated_by             | FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL                           |
| show_message_threads            | show_message_threads_participant_id_fkey                    | participant_id         | FOREIGN KEY (participant_id) REFERENCES auth.users(id) ON DELETE CASCADE                        |
| show_messages                   | show_messages_sender_id_fkey                                | sender_id              | FOREIGN KEY (sender_id) REFERENCES auth.users(id)                                               |
| show_messages                   | show_messages_show_id_fkey                                  | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE                                    |
| show_payouts                    | show_payouts_club_stripe_account_id_fkey                    | club_stripe_account_id | FOREIGN KEY (club_stripe_account_id) REFERENCES club_stripe_accounts(id)                        |
| show_visibility_settings        | show_visibility_settings_updated_by_fkey                    | updated_by             | FOREIGN KEY (updated_by) REFERENCES auth.users(id)                                              |
| shows                           | shows_deleted_by_fkey                                       | deleted_by             | FOREIGN KEY (deleted_by) REFERENCES auth.users(id)                                              |
| sport_titles                    | sport_titles_prerequisite_title_id_fkey                     | prerequisite_title_id  | FOREIGN KEY (prerequisite_title_id) REFERENCES sport_titles(id)                                 |
| subscription_entitlement_grants | subscription_entitlement_grants_granted_by_person_id_fkey   | granted_by_person_id   | FOREIGN KEY (granted_by_person_id) REFERENCES people(id)                                        |
| subscription_entitlement_grants | subscription_entitlement_grants_revoked_by_person_id_fkey   | revoked_by_person_id   | FOREIGN KEY (revoked_by_person_id) REFERENCES people(id)                                        |
| subscription_entitlement_grants | subscription_entitlement_grants_superseded_by_grant_id_fkey | superseded_by_grant_id | FOREIGN KEY (superseded_by_grant_id) REFERENCES subscription_entitlement_grants(id)             |
| support_ticket_messages         | support_ticket_messages_sender_id_fkey                      | sender_id              | FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE                             |
| support_tickets                 | support_tickets_show_id_fkey                                | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL                                   |
| trial_checklist_state           | trial_checklist_state_completed_by_fkey                     | completed_by           | FOREIGN KEY (completed_by) REFERENCES auth.users(id) ON DELETE SET NULL                         |
| trial_judge_supplies            | trial_judge_supplies_person_id_fkey                         | person_id              | FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL                                |
| trial_visibility_overrides      | trial_visibility_overrides_updated_by_fkey                  | updated_by             | FOREIGN KEY (updated_by) REFERENCES auth.users(id)                                              |
| trials                          | trials_deleted_by_fkey                                      | deleted_by             | FOREIGN KEY (deleted_by) REFERENCES auth.users(id)                                              |
| user_roles                      | user_roles_club_id_fkey                                     | club_id                | FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE                                    |
| user_roles                      | user_roles_show_id_fkey                                     | show_id                | FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE                                    |
| waitlist_entries                | waitlist_entries_promoted_entry_id_fkey                     | promoted_entry_id      | FOREIGN KEY (promoted_entry_id) REFERENCES entries(id) ON DELETE SET NULL                       |

## Duplicate groups

| Table              | Drop                             | Retain                           | Evidence                                                                                                                                             |
| ------------------ | -------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| platform_waitlist  | `platform_waitlist_email_unique` | `platform_waitlist_email_key`    | Exact definitions; both have 0 scans. Retained name is declared by `197_create_platform_waitlist.sql`; dropped twin has no current migration source. |
| push_subscriptions | `push_subscriptions_user_id_idx` | `idx_push_subscriptions_user_id` | Exact definitions. Retained index has 48 scans/106 tuples read and is declared by the later `056_push_subscriptions.sql`; dropped twin has 0 scans.  |

## Zero-scan dispositions

Summary:

| Disposition                        |   Count |
| ---------------------------------- | ------: |
| KEEP — constraint/invariant        |      43 |
| KEEP — FK/join                     |      25 |
| KEEP — query path pending MYK9-109 |      77 |
| DROP — exact duplicate             |       2 |
| **Total**                          | **147** |

`KEEP — query path pending MYK9-109` names the table filter/order definition but defers any
usage-based deletion decision until realistic show-weekend traffic exists.

| Table                         | Index                                                      |       Size | Disposition and query/constraint reason                                           |
| ----------------------------- | ---------------------------------------------------------- | ---------: | --------------------------------------------------------------------------------- |
| activity_log                  | idx_activity_log_action_type                               | 8192 bytes | KEEP — pending MYK9-109; action-log filters on `action_type`.                     |
| activity_log                  | idx_activity_log_trial_id                                  | 8192 bytes | KEEP — FK/join; trial relationship checks and filters on `trial_id`.              |
| analytics_events              | idx_analytics_events_section_created                       | 8192 bytes | KEEP — pending MYK9-109; section timelines on `(section_name, created_at)`.       |
| announcement_reads            | announcement_reads_announcement_id_idx                     | 8192 bytes | KEEP — FK/join; announcement relationship checks and read lookups.                |
| announcement_reads            | announcement_reads_announcement_id_user_id_key             | 8192 bytes | KEEP — constraint/invariant; one read marker per announcement/user.               |
| announcements                 | announcements_license_key_idx                              | 8192 bytes | KEEP — pending MYK9-109; licensed announcement filters.                           |
| chatbot_query_log             | idx_chatbot_query_log_created_at                           |      16 kB | KEEP — pending MYK9-109; recent-query ordering by `created_at DESC`.              |
| chatbot_query_log             | idx_chatbot_query_log_operator_daily                       |      16 kB | KEEP — pending MYK9-109; operator-support daily queries by user/time.             |
| classes                       | classes_competition_type_idx                               |      16 kB | KEEP — pending MYK9-109; class filters by competition type.                       |
| club_access_requests          | club_access_requests_requester_auth_status_idx             |      16 kB | KEEP — pending MYK9-109; requester/status access-request lookup.                  |
| club_access_requests          | club_access_requests_status_created_idx                    |      16 kB | KEEP — pending MYK9-109; access-request queue by status/recency.                  |
| club_members                  | idx_club_members_club                                      |      16 kB | KEEP — FK/join; club membership relationship checks and lists.                    |
| club_officers                 | club_officers_club_id_person_id_position_key               | 8192 bytes | KEEP — constraint/invariant; prevents duplicate officer positions.                |
| club_premium_templates        | club_premium_templates_default_unique                      |      16 kB | KEEP — constraint/invariant; one default premium template per club.               |
| club_stripe_accounts          | club_stripe_accounts_club_id_livemode_unique               |      16 kB | KEEP — constraint/invariant; one account per club/mode.                           |
| club_stripe_accounts          | club_stripe_accounts_livemode_idx                          |      16 kB | KEEP — pending MYK9-109; Stripe-account mode filters.                             |
| clubs                         | clubs_license_key_idx                                      |      16 kB | KEEP — pending MYK9-109; licensed club lookup.                                    |
| clubs                         | clubs_live_normalized_name_unique                          |      16 kB | KEEP — constraint/invariant; unique live normalized club name.                    |
| dog_favorites                 | dog_favorites_pkey                                         | 8192 bytes | KEEP — constraint/invariant; primary-key enforcement.                             |
| dog_registrations             | dog_registrations_live_dog_org_unique                      |      16 kB | KEEP — constraint/invariant; one live registration per dog/organization.          |
| dog_registrations             | dog_registrations_live_org_number_unique                   |      16 kB | KEEP — constraint/invariant; unique live organization/registration number.        |
| dog_registrations             | dog_registrations_one_primary_per_dog                      |      16 kB | KEEP — constraint/invariant; one primary registration per dog.                    |
| dog_registrations             | dog_registrations_org_number_idx                           |      16 kB | KEEP — pending MYK9-109; registry lookup by organization/number.                  |
| dog_registrations             | idx_dog_registrations_organization                         |      16 kB | KEEP — pending MYK9-109; registration filters by organization.                    |
| dog_registrations             | idx_dog_registrations_status                               |      16 kB | KEEP — pending MYK9-109; registration review filters by status.                   |
| dogs                          | dogs_breed_idx                                             |      16 kB | KEEP — pending MYK9-109; dog directory filters by breed.                          |
| dogs                          | dogs_license_key_idx                                       |      16 kB | KEEP — pending MYK9-109; licensed dog lookup.                                     |
| dogs                          | dogs_microchip_number_unique_live                          |      16 kB | KEEP — constraint/invariant; unique microchip among live dogs.                    |
| dogs                          | dogs_status_idx                                            |      16 kB | KEEP — pending MYK9-109; dog filters by status.                                   |
| enrollments                   | registrations_confirmation_number_key                      |      16 kB | KEEP — constraint/invariant; unique confirmation number.                          |
| entries                       | entries_license_key_idx                                    |      16 kB | KEEP — pending MYK9-109; licensed entry lookup.                                   |
| entries                       | entries_payment_status_show_id_idx                         |      16 kB | KEEP — pending MYK9-109; pending-payment entries by show.                         |
| entries                       | idx_entries_time_qualified                                 |      16 kB | KEEP — pending MYK9-109; qualified result ranking by search time.                 |
| entry_cart_items              | entry_cart_items_cart_id_idx                               |      16 kB | KEEP — FK/join; cart relationship checks and item lists.                          |
| entry_payment_links           | entry_payment_links_entry_ids_idx                          |      24 kB | KEEP — pending MYK9-109; GIN membership lookup in `entry_ids`.                    |
| fcm_tokens                    | fcm_tokens_auth_user_id_idx                                | 8192 bytes | KEEP — pending MYK9-109; push-token lookup by auth user.                          |
| fcm_tokens                    | fcm_tokens_token_key                                       | 8192 bytes | KEEP — constraint/invariant; unique FCM token.                                    |
| frontend_logs                 | idx_frontend_logs_category                                 | 8192 bytes | KEEP — pending MYK9-109; diagnostics filters by category.                         |
| frontend_logs                 | idx_frontend_logs_fingerprint                              | 8192 bytes | KEEP — pending MYK9-109; diagnostics grouping by fingerprint.                     |
| frontend_logs                 | idx_frontend_logs_level                                    | 8192 bytes | KEEP — pending MYK9-109; partial high-severity log filter.                        |
| health_records                | health_records_date_idx                                    | 8192 bytes | KEEP — pending MYK9-109; health-record chronology by date.                        |
| judge_availability            | judge_availability_dates_idx                               |      16 kB | KEEP — pending MYK9-109; availability overlap checks by date range.               |
| judge_availability            | judge_availability_status_idx                              |      16 kB | KEEP — pending MYK9-109; judge availability status filters.                       |
| judge_certifications          | judge_certifications_org_sport_idx                         | 8192 bytes | KEEP — pending MYK9-109; certification filters by organization/sport.             |
| judge_qualifications          | judge_qualifications_org_idx                               |      16 kB | KEEP — pending MYK9-109; qualification filters by organization.                   |
| login_attempts                | login_attempts_pkey                                        |      16 kB | KEEP — constraint/invariant; primary-key enforcement.                             |
| manual_results                | idx_manual_results_dog_id                                  |      16 kB | KEEP — FK/join; dog relationship checks and result history.                       |
| manual_results                | idx_manual_results_trial_date                              |      16 kB | KEEP — pending MYK9-109; manual-result chronology by trial date.                  |
| medications                   | medications_active_idx                                     |      16 kB | KEEP — pending MYK9-109; active-medication filters.                               |
| nationals_rankings            | nationals_rankings_current_rank_idx                        | 8192 bytes | KEEP — pending MYK9-109; nationals leaderboard ordering.                          |
| nationals_rankings            | nationals_rankings_entry_id_key                            | 8192 bytes | KEEP — constraint/invariant; one nationals ranking per entry.                     |
| nationals_rankings            | nationals_rankings_license_key_idx                         | 8192 bytes | KEEP — pending MYK9-109; licensed nationals ranking lookup.                       |
| nationals_scores              | nationals_scores_entry_id_element_type_competition_day_key | 8192 bytes | KEEP — constraint/invariant; one score per entry/element/day.                     |
| nationals_scores              | nationals_scores_license_key_idx                           | 8192 bytes | KEEP — pending MYK9-109; licensed nationals score lookup.                         |
| notification_preferences      | notification_preferences_user_id_key                       | 8192 bytes | KEEP — constraint/invariant; one preference row per user.                         |
| notification_queue            | notification_queue_scheduled_idx                           | 8192 bytes | KEEP — pending MYK9-109; due-notification scheduling.                             |
| notification_queue            | notification_queue_status_idx                              | 8192 bytes | KEEP — pending MYK9-109; notification queue by status.                            |
| offline_scoring               | offline_scoring_entry_id_client_id_key                     | 8192 bytes | KEEP — constraint/invariant; idempotent entry/client score record.                |
| offline_scoring               | offline_scoring_synced_idx                                 | 8192 bytes | KEEP — pending MYK9-109; unsynced scoring queue.                                  |
| onboarding_requests           | idx_onboarding_requests_one_active_per_user                | 8192 bytes | KEEP — constraint/invariant; one pending/contacted request per user.              |
| onboarding_requests           | idx_onboarding_requests_status                             | 8192 bytes | KEEP — pending MYK9-109; onboarding queue by status.                              |
| paperwork_prints              | paperwork_prints_class_report_latest_idx                   |      16 kB | KEEP — pending MYK9-109; latest non-void class report print.                      |
| paperwork_prints              | paperwork_prints_show_report_latest_idx                    |      16 kB | KEEP — pending MYK9-109; latest non-void show report print.                       |
| paperwork_prints              | paperwork_prints_trial_report_latest_idx                   |      16 kB | KEEP — pending MYK9-109; latest non-void trial report print.                      |
| people                        | people_auth_user_id_idx                                    |      16 kB | KEEP — pending MYK9-109; person lookup by auth user.                              |
| people                        | people_license_key_idx                                     |      16 kB | KEEP — pending MYK9-109; licensed person lookup.                                  |
| performance_metrics           | performance_metrics_created_idx                            | 8192 bytes | KEEP — pending MYK9-109; metrics chronology/retention by created time.            |
| performance_metrics           | performance_metrics_type_idx                               | 8192 bytes | KEEP — pending MYK9-109; metrics filters by type.                                 |
| platform_waitlist             | platform_waitlist_email_key                                |      16 kB | KEEP — constraint/invariant; unique normalized waitlist email.                    |
| platform_waitlist             | platform_waitlist_email_unique                             |      16 kB | DROP — exact duplicate of `platform_waitlist_email_key`.                          |
| platform_waitlist             | platform_waitlist_granted_idx                              |      16 kB | KEEP — pending MYK9-109; granted-waitlist chronology.                             |
| platform_waitlist             | platform_waitlist_role_idx                                 |      16 kB | KEEP — pending MYK9-109; waitlist segmentation by role.                           |
| premium_generation_attempts   | premium_generation_attempts_show_idx                       |      16 kB | KEEP — FK/join; show relationship checks and throttle history.                    |
| promo_codes                   | idx_promo_codes_show_code                                  | 8192 bytes | KEEP — constraint/invariant; unique show-scoped promo code.                       |
| promo_codes                   | idx_promo_codes_trial_id                                   | 8192 bytes | KEEP — FK/join; trial relationship checks and promo lookup.                       |
| push_notification_queue       | push_notification_queue_scheduled_idx                      | 8192 bytes | KEEP — pending MYK9-109; due push-notification scheduling.                        |
| push_notification_queue       | push_notification_queue_status_idx                         | 8192 bytes | KEEP — pending MYK9-109; push queue by status.                                    |
| push_subscriptions            | push_subscriptions_license_key_idx                         |      16 kB | KEEP — pending MYK9-109; licensed push-subscription lookup.                       |
| push_subscriptions            | push_subscriptions_user_id_idx                             |      16 kB | DROP — exact duplicate of the 48-scan `idx_push_subscriptions_user_id`.           |
| ringside_sessions             | ringside_sessions_favorited_armbands_idx                   |      24 kB | KEEP — pending MYK9-109; GIN membership lookup for favorited armbands.            |
| role_requests                 | role_requests_one_pending_scope_idx                        | 8192 bytes | KEEP — constraint/invariant; one pending request per person/role/scope.           |
| role_requests                 | role_requests_pkey                                         | 8192 bytes | KEEP — constraint/invariant; primary-key enforcement.                             |
| rule_organizations            | rule_organizations_code_key                                | 8192 bytes | KEEP — constraint/invariant; unique rule-organization code.                       |
| rule_sports                   | rule_sports_organization_id_code_key                       | 8192 bytes | KEEP — constraint/invariant; unique sport code per organization.                  |
| rule_sports                   | rule_sports_organization_id_idx                            | 8192 bytes | KEEP — FK/join; organization relationship checks and sport lists.                 |
| rulebooks                     | rulebooks_organization_id_idx                              | 8192 bytes | KEEP — FK/join; organization relationship checks and rulebook lists.              |
| rulebooks                     | rulebooks_sport_id_idx                                     | 8192 bytes | KEEP — FK/join; sport relationship checks and rulebook lists.                     |
| rules                         | rules_keywords_idx                                         |      16 kB | KEEP — pending MYK9-109; GIN keyword search.                                      |
| rules                         | rules_rulebook_id_idx                                      | 8192 bytes | KEEP — FK/join; rulebook relationship checks and rule lists.                      |
| rules_feedback                | rules_feedback_query_log_id_idx                            | 8192 bytes | KEEP — FK/join; query-log relationship checks and feedback lookup.                |
| rules_feedback                | rules_feedback_rule_id_idx                                 | 8192 bytes | KEEP — FK/join; rule relationship checks and feedback lookup.                     |
| show_announcements            | idx_show_announcements_expires                             |      16 kB | KEEP — pending MYK9-109; expiring-announcement cleanup/filter.                    |
| show_incidents                | show_incidents_reportable_idx                              | 8192 bytes | KEEP — pending MYK9-109; reportable/urgent incidents by show.                     |
| show_lifecycle_email_attempts | show_lifecycle_email_attempts_email_log_id_idx             | 8192 bytes | KEEP — pending MYK9-109; non-null email-log correlation.                          |
| show_lifecycle_email_attempts | show_lifecycle_email_attempts_job_attempted_idx            | 8192 bytes | KEEP — FK/join; job relationship checks and attempt chronology.                   |
| show_lifecycle_email_attempts | show_lifecycle_email_attempts_pkey                         | 8192 bytes | KEEP — constraint/invariant; primary-key enforcement.                             |
| show_lifecycle_email_jobs     | show_lifecycle_email_jobs_batch_status_idx                 | 8192 bytes | KEEP — pending MYK9-109; batch/status jobs by show.                               |
| show_lifecycle_email_jobs     | show_lifecycle_email_jobs_email_log_id_idx                 | 8192 bytes | KEEP — pending MYK9-109; non-null email-log correlation.                          |
| show_lifecycle_email_jobs     | show_lifecycle_email_jobs_idempotency_key_idx              | 8192 bytes | KEEP — constraint/invariant; lifecycle-job idempotency.                           |
| show_lifecycle_email_jobs     | show_lifecycle_email_jobs_pkey                             | 8192 bytes | KEEP — constraint/invariant; primary-key enforcement.                             |
| show_lifecycle_email_jobs     | show_lifecycle_email_jobs_show_status_due_idx              | 8192 bytes | KEEP — pending MYK9-109; ready jobs by show/due time.                             |
| show_lifecycle_email_jobs     | show_lifecycle_email_jobs_step_status_idx                  | 8192 bytes | KEEP — FK/join; step relationship checks and status filters.                      |
| show_lifecycle_email_steps    | show_lifecycle_email_steps_pkey                            |      16 kB | KEEP — constraint/invariant; primary-key enforcement.                             |
| show_money_locks              | show_money_locks_expires_at_idx                            | 8192 bytes | KEEP — pending MYK9-109; expired-lock cleanup.                                    |
| show_money_locks              | show_money_locks_pkey                                      | 8192 bytes | KEEP — constraint/invariant; one money lock per show.                             |
| show_payouts                  | show_payouts_show_id_idx                                   | 8192 bytes | KEEP — FK/join; show relationship checks and payout lookup.                       |
| shows                         | shows_license_key_idx                                      |      16 kB | KEEP — pending MYK9-109; licensed show lookup.                                    |
| sport_titles                  | sport_titles_template_idx                                  |      16 kB | KEEP — FK/join; sport-template relationship checks and title lists.               |
| stripe_customers              | stripe_customers_livemode_idx                              |      16 kB | KEEP — pending MYK9-109; Stripe customer mode filters.                            |
| stripe_customers              | stripe_customers_person_id_livemode_unique                 |      16 kB | KEEP — constraint/invariant; one Stripe customer per person/mode.                 |
| stripe_customers              | stripe_customers_stripe_customer_id_key                    |      16 kB | KEEP — constraint/invariant; unique Stripe customer ID.                           |
| stripe_order_refunds          | stripe_order_refunds_pkey                                  | 8192 bytes | KEEP — constraint/invariant; unique Stripe refund ID.                             |
| stripe_orders                 | idx_stripe_orders_processing_fee_pending                   |      16 kB | KEEP — pending MYK9-109; succeeded orders awaiting processing-fee reconciliation. |
| stripe_orders                 | stripe_orders_checkout_session_id_key                      |      16 kB | KEEP — constraint/invariant; unique non-null checkout session.                    |
| stripe_orders                 | stripe_orders_show_created_id_idx                          |      16 kB | KEEP — FK/join; show relationship checks and order chronology.                    |
| stripe_orders                 | stripe_orders_status_idx                                   |      16 kB | KEEP — pending MYK9-109; Stripe order status filters.                             |
| stripe_orders                 | stripe_orders_stripe_payment_intent_id_key                 |      16 kB | KEEP — constraint/invariant; unique payment intent.                               |
| support_ticket_messages       | idx_support_ticket_messages_unread                         | 8192 bytes | KEEP — pending MYK9-109; unread messages by ticket/sender.                        |
| support_ticket_messages       | support_ticket_messages_pkey                               | 8192 bytes | KEEP — constraint/invariant; primary-key enforcement.                             |
| support_tickets               | idx_support_tickets_status_priority                        |      16 kB | KEEP — pending MYK9-109; support queue by status/show-day priority/recency.       |
| sync_conflicts                | sync_conflicts_table_record_idx                            |      16 kB | KEEP — pending MYK9-109; conflict lookup by source table/record.                  |
| training_goals                | training_goals_completed_at_idx                            | 8192 bytes | KEEP — pending MYK9-109; goal completion filters/chronology.                      |
| training_goals                | training_goals_pkey                                        | 8192 bytes | KEEP — constraint/invariant; primary-key enforcement.                             |
| training_journal_entries      | idx_training_journal_entries_date                          |      16 kB | KEEP — pending MYK9-109; training journal chronology.                             |
| training_journal_entries      | idx_training_journal_entries_sport_tag                     |      16 kB | KEEP — pending MYK9-109; journal filters by sport tag.                            |
| trial_checklist_state         | idx_checklist_trial_id                                     | 8192 bytes | KEEP — FK/join; trial relationship checks and checklist lookup.                   |
| trial_checklist_state         | trial_checklist_unique                                     | 8192 bytes | KEEP — constraint/invariant; one checklist item key per trial.                    |
| trial_judge_supplies          | trial_judge_supplies_trial_judge_idx                       | 8192 bytes | KEEP — FK/join; trial/judge supply ordering and trial relationship checks.        |
| trial_judge_supplies          | trial_judge_supplies_unique_no_person                      | 8192 bytes | KEEP — constraint/invariant; unique unlinked judge supply item.                   |
| trials                        | idx_trials_pipeline_stage                                  |      16 kB | KEEP — pending MYK9-109; trial pipeline filters.                                  |
| trials                        | trials_deleted_at_idx                                      |      16 kB | KEEP — pending MYK9-109; soft-delete filters.                                     |
| user_guide                    | idx_user_guide_search                                      |      16 kB | KEEP — pending MYK9-109; full-text guide search.                                  |
| user_preferences              | user_preferences_auth_user_id_idx                          |      16 kB | KEEP — pending MYK9-109; preferences lookup by auth user.                         |
| user_preferences              | user_preferences_pkey                                      |      16 kB | KEEP — constraint/invariant; primary-key enforcement.                             |
| user_roles                    | user_roles_expires_at_idx                                  |      16 kB | KEEP — pending MYK9-109; expiring-role lookup.                                    |
| user_roles                    | user_roles_user_id_idx                                     |      16 kB | KEEP — FK/join; user relationship checks and role lookup.                         |
| vaccinations                  | vaccinations_expiration_idx                                |      16 kB | KEEP — pending MYK9-109; vaccination expiration filters.                          |
| volunteer_class_assignments   | volunteer_class_assignments_role_id_idx                    | 8192 bytes | KEEP — FK/join; role relationship checks and class-assignment lookup.             |
| volunteer_class_assignments   | volunteer_class_assignments_volunteer_class_role_name_key  | 8192 bytes | KEEP — constraint/invariant; unique volunteer/class/role assignment.              |
| volunteer_class_assignments   | volunteer_class_assignments_volunteer_id_idx               | 8192 bytes | KEEP — FK/join; volunteer relationship checks and class assignments.              |
| volunteer_general_assignments | volunteer_general_assignments_role_id_idx                  | 8192 bytes | KEEP — FK/join; role relationship checks and general-assignment lookup.           |
| volunteer_general_assignments | volunteer_general_assignments_volunteer_id_idx             | 8192 bytes | KEEP — FK/join; volunteer relationship checks and general assignments.            |
| volunteer_general_assignments | volunteer_general_assignments_volunteer_show_role_name_key | 8192 bytes | KEEP — constraint/invariant; unique volunteer/show/role assignment.               |
| volunteers                    | volunteers_license_key_idx                                 | 8192 bytes | KEEP — pending MYK9-109; licensed volunteer lookup.                               |
| waitlist_entries              | waitlist_entries_active_class_dog_key                      |      16 kB | KEEP — constraint/invariant; one active class/dog waitlist row.                   |
| waitlist_entries              | waitlist_entries_class_id_idx                              |      16 kB | KEEP — FK/join; class relationship checks and waitlist lookup.                    |
| waitlist_entries              | waitlist_entries_pkey                                      |      16 kB | KEEP — constraint/invariant; primary-key enforcement.                             |

## Post-deployment evidence gate

No shared-system mutation has been performed. The real `supabase db push`, catalog rerun, and
performance-advisor rerun remain pending explicit user approval. MYK9-113 must remain open until
that evidence is recorded. The 2026-07-28 linked-project dry run reported exactly the two intended
migrations and applied neither.

## Local verification

| Check                                       | Result       | Evidence                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion-first additive migration contract | Expected RED | 2026-07-28: 2 tests failed because `20260728140000_add_foreign_key_indexes.sql` did not exist.                                                                                                                                                                                                             |
| Additive migration source contract          | PASS         | 2026-07-28: 2/2 focused tests passed; 78 exact pairs, strict postcondition, no drops.                                                                                                                                                                                                                      |
| Assertion-first duplicate-removal contract  | Expected RED | 2026-07-28: 1 test failed because `20260728141000_drop_duplicate_indexes.sql` did not exist; 2 additive tests remained green.                                                                                                                                                                              |
| Complete migration source contract          | PASS         | 2026-07-28: 3/3 focused tests passed; the two guarded drops are separate and both canonical survivors are protected.                                                                                                                                                                                       |
| Focused database source suite               | PASS         | 2026-07-28: 13/13 tests passed across index hygiene, migration-version uniqueness, and DB migration sanity.                                                                                                                                                                                                |
| Isolated live-schema execution              | PASS         | This repository uses remote Supabase, not Supabase local/Docker. A disposable vanilla PostgreSQL 18 cluster restored a read-only schema snapshot of the linked PostgreSQL 17 database. First application created 78 indexes and finished with 0 strict uncovered FKs and 0 exact duplicate groups.         |
| Isolated idempotency rerun                  | RED → PASS   | The first rerun exposed eager resolution of a missing `regclass` inside a combined guard. Nested guards fixed it; the corrected subtractive migration reran with both twins already absent and retained 0 strict uncovered FKs / 0 duplicate groups.                                                       |
| Exact duplicate guards                      | RED → PASS   | OpenSpec verification added valid/ready requirements. Independent PR review then found missing `indnullsnotdistinct` comparison. Both assertions failed first; the strengthened migration passed 3/3 tests and two idempotent executions against disposable vanilla PostgreSQL.                            |
| Quality gates                               | PASS         | Strict OpenSpec validation, targeted ESLint, test TypeScript checking, and `git diff --check` passed.                                                                                                                                                                                                      |
| Remote Supabase dry run                     | PASS         | After transient project-link failures cleared, the linked-project dry run reported only `20260728140000_add_foreign_key_indexes.sql` and `20260728141000_drop_duplicate_indexes.sql`. No migration was applied.                                                                                            |
| Broad repository checks                     | INCOMPLETE   | The full myK9Show Vitest run exceeded the repository's 60-second hang limit and was stopped. Turbo typecheck was stopped after 25/26 tasks at 1m37s, and lint after 13/14 tasks at 1m40s, when neither produced further output. No failure was reported before the stops; focused changed-file gates pass. |
