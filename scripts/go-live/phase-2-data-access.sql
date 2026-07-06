-- Go Live Runbook Phase 2 seed/access evidence checklist.
-- Read-only by design. Run against staging/prod with an appropriate read-capable DB URL.

\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

WITH
  required_roles(role_name) AS (
    VALUES
      ('secretary'),
      ('club_admin'),
      ('judge'),
      ('steward'),
      ('chairman')
  ),
  active_roles AS (
    SELECT r.name, count(*) AS active_grants
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.is_active
    GROUP BY r.name
  ),
  missing_roles AS (
    SELECT rr.role_name
    FROM required_roles rr
    LEFT JOIN active_roles ar ON ar.name = rr.role_name
    WHERE coalesce(ar.active_grants, 0) = 0
  ),
  checks(ordinal, check_key, ok, detail) AS (
    SELECT
      1,
      'judge_assignments',
      count(*) > 0,
      count(*)::text || ' rows'
    FROM public.judge_assignments

    UNION ALL

    SELECT
      2,
      'active_role_grants',
      NOT EXISTS (SELECT 1 FROM missing_roles),
      'missing=' || coalesce((SELECT string_agg(role_name, ', ' ORDER BY role_name) FROM missing_roles), 'none')

    UNION ALL

    SELECT
      3,
      'demo_show_passcodes',
      count(*) > 0,
      count(*)::text || ' rows for Heartland demo show'
    FROM public.show_passcodes
    WHERE show_id = 'dededede-0000-0000-0000-000000000010'

    UNION ALL

    SELECT
      4,
      'demo_show_and_classes',
      show_count = 1 AND class_count > 0,
      'shows=' || show_count::text || ', classes=' || class_count::text
    FROM (
      SELECT
        (SELECT count(*) FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000010') AS show_count,
        (
          SELECT count(*)
          FROM public.classes c
          JOIN public.trials t ON t.id = c.trial_id
          WHERE t.show_id = 'dededede-0000-0000-0000-000000000010'
        ) AS class_count
    ) demo_counts

    UNION ALL

    SELECT
      5,
      'stale_anon_cleanup_cron',
      count(*) > 0,
      count(*)::text || ' active cron rows'
    FROM cron.job
    WHERE jobname = 'cleanup_stale_ringside_anon_users'
      AND active

    UNION ALL

    SELECT
      6,
      'judge_qualifications_preload',
      count(*) > 0,
      count(*)::text || ' rows'
    FROM public.judge_qualifications
  )
SELECT
  CASE WHEN ok THEN 'ok' ELSE 'fail' END AS status,
  check_key,
  detail
FROM checks
ORDER BY ordinal;

ROLLBACK;
