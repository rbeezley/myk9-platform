BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT id, name, status, deleted_at, club_id, created_at
FROM public.shows
WHERE id = 'f3360000-0000-0000-0000-000000000001';

SELECT id, name, status, start_date
FROM public.shows
WHERE id <> 'f3360000-0000-0000-0000-000000000001'
  AND name = '[E2E MYK9-336] Past Due Payment Fixture'
ORDER BY id;

WITH target_trials AS (
  SELECT id
  FROM public.trials
  WHERE show_id = 'f3360000-0000-0000-0000-000000000001'
),
target_classes AS (
  SELECT c.id
  FROM public.classes c
  JOIN target_trials t ON t.id = c.trial_id
),
target_enrollments AS (
  SELECT id
  FROM public.enrollments
  WHERE show_id = 'f3360000-0000-0000-0000-000000000001'
)
SELECT
  (SELECT count(*) FROM target_trials) AS trials,
  (SELECT count(*) FROM target_classes) AS classes,
  (SELECT count(*) FROM target_enrollments) AS enrollments,
  (SELECT count(*)
   FROM public.entries e
   WHERE e.show_id = 'f3360000-0000-0000-0000-000000000001'
      OR e.trial_id IN (SELECT id FROM target_trials)
      OR e.class_id IN (SELECT id FROM target_classes)
      OR e.registration_id IN (SELECT id FROM target_enrollments)) AS entries,
  (SELECT count(*)
   FROM public.result_submissions rs
   WHERE rs.show_id = 'f3360000-0000-0000-0000-000000000001'
      OR rs.trial_id IN (SELECT id FROM target_trials)) AS result_submissions,
  (SELECT count(*)
   FROM public.activity_log a
   WHERE a.trial_id IN (SELECT id FROM target_trials)) AS activity_log,
  (SELECT count(*)
   FROM public.trial_packet_snapshots p
   WHERE p.show_id = 'f3360000-0000-0000-0000-000000000001') AS trial_packet_snapshots,
  (SELECT count(*)
   FROM public.trial_packet_generation_claims c
   WHERE c.show_id = 'f3360000-0000-0000-0000-000000000001') AS packet_generation_claims,
  (SELECT count(*)
   FROM public.stripe_orders o
   WHERE o.show_id = 'f3360000-0000-0000-0000-000000000001'
      OR o.enrollment_id IN (SELECT id FROM target_enrollments)) AS stripe_orders,
  (SELECT count(*)
   FROM public.stripe_order_refunds r
   JOIN public.stripe_orders o ON o.id = r.order_id
   WHERE o.show_id = 'f3360000-0000-0000-0000-000000000001'
      OR o.enrollment_id IN (SELECT id FROM target_enrollments)) AS stripe_order_refunds,
  (SELECT count(*)
   FROM public.entry_payment_links l
   WHERE l.show_id = 'f3360000-0000-0000-0000-000000000001') AS entry_payment_links,
  (SELECT count(*)
   FROM public.show_money_locks l
   WHERE l.show_id = 'f3360000-0000-0000-0000-000000000001') AS show_money_locks,
  (SELECT count(*)
   FROM public.promo_codes p
   WHERE p.show_id = 'f3360000-0000-0000-0000-000000000001'
      OR p.trial_id IN (SELECT id FROM target_trials)) AS promo_codes,
  (SELECT count(*)
   FROM public.show_payouts p
   WHERE p.show_id = 'f3360000-0000-0000-0000-000000000001') AS show_payouts,
  (SELECT count(*)
   FROM public.paperwork_prints p
   WHERE p.show_id = 'f3360000-0000-0000-0000-000000000001'
      OR p.trial_id IN (SELECT id FROM target_trials)
      OR p.class_id IN (SELECT id FROM target_classes)) AS paperwork_prints,
  (SELECT count(*)
   FROM public.show_incidents i
   WHERE i.show_id = 'f3360000-0000-0000-0000-000000000001'
      OR i.trial_id IN (SELECT id FROM target_trials)
      OR i.class_id IN (SELECT id FROM target_classes)) AS show_incidents,
  (SELECT count(*)
   FROM public.email_log e
   WHERE e.show_id = 'f3360000-0000-0000-0000-000000000001') AS email_log,
  (SELECT count(*)
   FROM public.entry_status_history h
   JOIN public.entries e ON e.id = h.entry_id
   WHERE e.show_id = 'f3360000-0000-0000-0000-000000000001'
      OR e.trial_id IN (SELECT id FROM target_trials)
      OR e.class_id IN (SELECT id FROM target_classes)
      OR e.registration_id IN (SELECT id FROM target_enrollments)) AS entry_status_history;

WITH expected(parent_table, expected_edges) AS (
  VALUES ('shows', 39), ('trials', 14), ('classes', 8)
),
live AS (
  SELECT parent.relname AS parent_table, count(*)::integer AS live_edges
  FROM pg_catalog.pg_constraint fk
  JOIN pg_catalog.pg_class child ON child.oid = fk.conrelid
  JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
  JOIN pg_catalog.pg_class parent ON parent.oid = fk.confrelid
  JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
  WHERE fk.contype = 'f'
    AND child_ns.nspname = 'public'
    AND parent_ns.nspname = 'public'
    AND parent.relname IN ('shows', 'trials', 'classes')
  GROUP BY parent.relname
),
catalog_manifest_status AS (
  SELECT e.parent_table, e.expected_edges, coalesce(l.live_edges, 0) AS live_edges,
         CASE WHEN e.expected_edges = coalesce(l.live_edges, 0)
              THEN 'EDGE COUNT MATCHES REVIEWED MANIFEST'
              ELSE 'REVIEW REQUIRED: EDGE COUNT DIFFERS' END AS status
  FROM expected e
  LEFT JOIN live l USING (parent_table)
)
SELECT parent_table, expected_edges, live_edges, status
FROM catalog_manifest_status
ORDER BY parent_table;

SELECT fk.conname AS constraint_name,
       child_ns.nspname AS child_schema,
       child.relname AS child_table,
       pg_catalog.pg_get_constraintdef(fk.oid, true) AS definition,
       CASE fk.confdeltype
         WHEN 'a' THEN 'NO ACTION'
         WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE'
         WHEN 'n' THEN 'SET NULL'
         WHEN 'd' THEN 'SET DEFAULT'
       END AS delete_action
FROM pg_catalog.pg_constraint fk
JOIN pg_catalog.pg_class child ON child.oid = fk.conrelid
JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
JOIN pg_catalog.pg_class parent ON parent.oid = fk.confrelid
JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
WHERE fk.contype = 'f'
  AND child_ns.nspname = 'public'
  AND parent_ns.nspname = 'public'
  AND parent.relname IN ('shows', 'trials', 'classes')
ORDER BY parent.relname, child.relname, fk.conname;

ROLLBACK;
