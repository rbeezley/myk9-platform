BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
\set ON_ERROR_STOP on

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

WITH rpc_definition AS (
  SELECT pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.hard_delete_show(uuid)')::oid
  ) AS function_sql
),
rpc_manifest AS (
  SELECT CASE
           WHEN function_sql LIKE '%$manifest$%$manifest$%'
             THEN pg_catalog.split_part(function_sql, '$manifest$', 2)::jsonb
           ELSE NULL::jsonb
         END AS edges
  FROM rpc_definition
),
expected_edges AS (
  SELECT edge->>'constraint_schema' AS constraint_schema,
         edge->>'constraint_name' AS constraint_name,
         edge->>'child_schema' AS child_schema,
         edge->>'child_table' AS child_table,
         edge->>'child_column' AS child_column,
         edge->>'parent_schema' AS parent_schema,
         edge->>'parent_table' AS parent_table,
         edge->>'parent_column' AS parent_column,
         edge->>'delete_action' AS delete_action,
         edge->>'disposition' AS disposition,
         (edge->>'constraint_schema' = 'public'
          AND edge->>'constraint_name' = 'trials_show_id_fkey'
          AND edge->>'child_schema' = 'public'
          AND edge->>'child_table' = 'trials'
          AND edge->>'child_column' = 'show_id'
          AND edge->>'parent_schema' = 'public'
          AND edge->>'parent_table' = 'shows'
          AND edge->>'parent_column' = 'id'
          AND edge->>'delete_action' = 'CASCADE')
         OR (edge->>'constraint_schema' = 'public'
          AND edge->>'constraint_name' = 'classes_trial_id_fkey'
          AND edge->>'child_schema' = 'public'
          AND edge->>'child_table' = 'classes'
          AND edge->>'child_column' = 'trial_id'
          AND edge->>'parent_schema' = 'public'
          AND edge->>'parent_table' = 'trials'
          AND edge->>'parent_column' = 'id'
          AND edge->>'delete_action' = 'CASCADE') AS reviewed_disposable
  FROM rpc_manifest manifest
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
    coalesce(manifest.edges, '[]'::jsonb)
  ) AS manifest_edge(edge)
),
live_edges AS (
  SELECT fk.oid,
         child_ns.nspname AS child_schema,
         child.relname AS child_table,
         fk.conname AS constraint_name,
         parent_ns.nspname AS parent_schema,
         parent.relname AS parent_table,
         (SELECT pg_catalog.string_agg(a.attname, ',' ORDER BY fk_col.ordinality)
          FROM unnest(fk.conkey) WITH ORDINALITY AS fk_col(attnum, ordinality)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid = fk.conrelid AND a.attnum = fk_col.attnum) AS child_column,
         (SELECT pg_catalog.string_agg(a.attname, ',' ORDER BY fk_col.ordinality)
          FROM unnest(fk.confkey) WITH ORDINALITY AS fk_col(attnum, ordinality)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid = fk.confrelid AND a.attnum = fk_col.attnum) AS parent_column,
         pg_catalog.cardinality(fk.conkey) AS column_count,
         pg_catalog.pg_get_constraintdef(fk.oid, true) AS fk_definition,
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
),
edge_differences AS (
  SELECT
    (SELECT count(*)
     FROM expected_edges expected
     WHERE NOT EXISTS (
       SELECT 1 FROM live_edges live
       WHERE live.child_schema = expected.child_schema
         AND live.child_table = expected.child_table
         AND live.constraint_name = expected.constraint_name
         AND live.child_column = expected.child_column
         AND live.parent_schema = expected.parent_schema
         AND live.parent_table = expected.parent_table
         AND live.parent_column = expected.parent_column
         AND live.delete_action = expected.delete_action
         AND expected.constraint_schema = live.child_schema
     )) AS missing_edges,
    (SELECT coalesce(
       pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
         'constraint_schema', expected.constraint_schema,
         'constraint_name', expected.constraint_name,
         'child_relation', pg_catalog.format('%I.%I', expected.child_schema, expected.child_table),
         'child_column', expected.child_column,
         'parent_relation', pg_catalog.format('%I.%I', expected.parent_schema, expected.parent_table),
         'parent_column', expected.parent_column,
         'delete_action', expected.delete_action,
         'disposition', expected.disposition
       ) ORDER BY expected.constraint_name), '[]'::jsonb)
     FROM expected_edges expected
     WHERE NOT EXISTS (
       SELECT 1 FROM live_edges live
       WHERE live.child_schema = expected.child_schema
         AND live.child_table = expected.child_table
         AND live.constraint_name = expected.constraint_name
         AND live.child_column = expected.child_column
         AND live.parent_schema = expected.parent_schema
         AND live.parent_table = expected.parent_table
         AND live.parent_column = expected.parent_column
         AND live.delete_action = expected.delete_action
         AND expected.constraint_schema = live.child_schema
     )) AS missing_edge_details,
    (SELECT count(*)
     FROM live_edges live
     WHERE NOT EXISTS (
       SELECT 1 FROM expected_edges expected
       WHERE expected.child_schema = live.child_schema
         AND expected.child_table = live.child_table
         AND expected.constraint_name = live.constraint_name
         AND expected.child_column = live.child_column
         AND expected.parent_schema = live.parent_schema
         AND expected.parent_table = live.parent_table
         AND expected.parent_column = live.parent_column
         AND expected.delete_action = live.delete_action
         AND expected.constraint_schema = live.child_schema
     )) AS added_or_changed_edges,
    (SELECT coalesce(
       pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
         'constraint_schema', live.child_schema,
         'constraint_name', live.constraint_name,
         'child_relation', pg_catalog.format('%I.%I', live.child_schema, live.child_table),
         'child_column', live.child_column,
         'parent_relation', pg_catalog.format('%I.%I', live.parent_schema, live.parent_table),
         'parent_column', live.parent_column,
         'delete_action', live.delete_action,
         'review_status', 'UNCLASSIFIED / CHANGED — STOP'
       ) ORDER BY live.constraint_name), '[]'::jsonb)
     FROM live_edges live
     WHERE NOT EXISTS (
       SELECT 1 FROM expected_edges expected
       WHERE expected.child_schema = live.child_schema
         AND expected.child_table = live.child_table
         AND expected.constraint_name = live.constraint_name
         AND expected.child_column = live.child_column
         AND expected.parent_schema = live.parent_schema
         AND expected.parent_table = live.parent_table
         AND expected.parent_column = live.parent_column
         AND expected.delete_action = live.delete_action
         AND expected.constraint_schema = live.child_schema
     )) AS added_or_changed_edge_details
)
SELECT CASE
         WHEN (SELECT edges FROM rpc_manifest) IS NULL
           THEN 'STOP: CURRENT RPC MANIFEST IS UNAVAILABLE'
         WHEN EXISTS (
           SELECT 1
           FROM expected_edges expected
           WHERE expected.disposition IS NULL
              OR expected.disposition NOT IN ('retain', 'disposable')
              OR (expected.disposition = 'disposable'
                  AND NOT coalesce(expected.reviewed_disposable, false))
         ) THEN 'STOP: UNRECOGNIZED RPC DISPOSITION'
         WHEN EXISTS (SELECT 1 FROM live_edges WHERE column_count <> 1)
           THEN 'STOP: COMPOSITE FK NEEDS REVIEW'
         WHEN missing_edges > 0 OR added_or_changed_edges > 0
           OR (SELECT jsonb_array_length(edges) FROM rpc_manifest)
              <> (SELECT count(*) FROM live_edges)
           THEN 'STOP: LIVE CATALOG DIFFERS FROM CURRENT RPC MANIFEST'
         ELSE 'EXACT MATCH TO CURRENT RPC MANIFEST'
       END AS catalog_manifest_status,
       (SELECT jsonb_array_length(edges) FROM rpc_manifest) AS manifest_edge_count,
       (SELECT count(*) FROM live_edges) AS live_edge_count,
       missing_edges,
       missing_edge_details,
       added_or_changed_edges,
       added_or_changed_edge_details
FROM edge_differences;

-- Generate one SELECT for every live FK edge. Identifiers come from the
-- catalog and are quoted with %I; the exact target UUID is inserted with %L.
-- \gexec executes only these generated SELECT statements in this read-only
-- transaction. Composite edges are listed with a NULL row count and a stop
-- status rather than being represented as an empty relation.
WITH rpc_definition AS (
  SELECT pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.hard_delete_show(uuid)')::oid
  ) AS function_sql
),
rpc_manifest AS (
  SELECT CASE
           WHEN function_sql LIKE '%$manifest$%$manifest$%'
             THEN pg_catalog.split_part(function_sql, '$manifest$', 2)::jsonb
           ELSE NULL::jsonb
         END AS edges
  FROM rpc_definition
),
expected_edges AS (
  SELECT edge->>'constraint_schema' AS constraint_schema,
         edge->>'constraint_name' AS constraint_name,
         edge->>'child_schema' AS child_schema,
         edge->>'child_table' AS child_table,
         edge->>'child_column' AS child_column,
         edge->>'parent_schema' AS parent_schema,
         edge->>'parent_table' AS parent_table,
         edge->>'parent_column' AS parent_column,
         edge->>'delete_action' AS delete_action,
         edge->>'disposition' AS disposition,
         (edge->>'constraint_schema' = 'public'
          AND edge->>'constraint_name' = 'trials_show_id_fkey'
          AND edge->>'child_schema' = 'public'
          AND edge->>'child_table' = 'trials'
          AND edge->>'child_column' = 'show_id'
          AND edge->>'parent_schema' = 'public'
          AND edge->>'parent_table' = 'shows'
          AND edge->>'parent_column' = 'id'
          AND edge->>'delete_action' = 'CASCADE')
         OR (edge->>'constraint_schema' = 'public'
          AND edge->>'constraint_name' = 'classes_trial_id_fkey'
          AND edge->>'child_schema' = 'public'
          AND edge->>'child_table' = 'classes'
          AND edge->>'child_column' = 'trial_id'
          AND edge->>'parent_schema' = 'public'
          AND edge->>'parent_table' = 'trials'
          AND edge->>'parent_column' = 'id'
          AND edge->>'delete_action' = 'CASCADE') AS reviewed_disposable
  FROM rpc_manifest manifest
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
    coalesce(manifest.edges, '[]'::jsonb)
  ) AS manifest_edge(edge)
),
live_edges AS (
  SELECT fk.oid,
         child_ns.nspname AS child_schema,
         child.relname AS child_table,
         fk.conname AS constraint_name,
         parent_ns.nspname AS parent_schema,
         parent.relname AS parent_table,
         (SELECT pg_catalog.string_agg(a.attname, ',' ORDER BY fk_col.ordinality)
          FROM unnest(fk.conkey) WITH ORDINALITY AS fk_col(attnum, ordinality)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid = fk.conrelid AND a.attnum = fk_col.attnum) AS child_column,
         (SELECT pg_catalog.string_agg(a.attname, ',' ORDER BY fk_col.ordinality)
          FROM unnest(fk.confkey) WITH ORDINALITY AS fk_col(attnum, ordinality)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid = fk.confrelid AND a.attnum = fk_col.attnum) AS parent_column,
         pg_catalog.cardinality(fk.conkey) AS column_count,
         pg_catalog.pg_get_constraintdef(fk.oid, true) AS fk_definition,
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
)
SELECT CASE
         WHEN live.column_count = 1 THEN pg_catalog.format(
           'SELECT %L::text AS constraint_name, %L::text AS child_relation, %L::text AS child_column, %L::text AS parent_relation, %L::text AS parent_column, %L::text AS fk_definition, %L::text AS delete_action, %L::text AS disposition, %L::text AS review_status, count(*)::bigint AS referencing_rows FROM %I.%I child WHERE child.%I IN (%s);',
           live.constraint_name,
           pg_catalog.format('%I.%I', live.child_schema, live.child_table),
           live.child_column,
           pg_catalog.format('%I.%I', live.parent_schema, live.parent_table),
           live.parent_column,
           live.fk_definition,
           live.delete_action,
           CASE
             WHEN expected.disposition = 'retain' THEN 'RETAINED (reviewed manifest)'
             WHEN expected.disposition = 'disposable'
               AND coalesce(expected.reviewed_disposable, false)
               THEN 'DISPOSABLE (reviewed structure)'
             WHEN expected.constraint_name IS NULL THEN 'RETAINED (default)'
             ELSE 'UNRECOGNIZED RPC DISPOSITION — STOP'
           END,
           CASE
             WHEN expected.constraint_name IS NULL THEN 'UNCLASSIFIED / CHANGED — STOP'
             WHEN expected.disposition IN ('retain', 'disposable')
               AND (expected.disposition = 'retain'
                 OR coalesce(expected.reviewed_disposable, false))
               THEN 'MATCHED TO CURRENT RPC MANIFEST'
             ELSE 'UNRECOGNIZED RPC DISPOSITION — STOP'
           END,
           live.child_schema,
           live.child_table,
           live.child_column,
           CASE live.parent_table
             WHEN 'shows' THEN pg_catalog.format(
               'SELECT p.%I FROM public.shows p WHERE p.id = %L::uuid',
               live.parent_column, 'f3360000-0000-0000-0000-000000000001')
             WHEN 'trials' THEN pg_catalog.format(
               'SELECT p.%I FROM public.trials p WHERE p.show_id = %L::uuid',
               live.parent_column, 'f3360000-0000-0000-0000-000000000001')
             WHEN 'classes' THEN pg_catalog.format(
               'SELECT p.%I FROM public.classes p JOIN public.trials t ON t.id = p.trial_id WHERE t.show_id = %L::uuid',
               live.parent_column, 'f3360000-0000-0000-0000-000000000001')
           END
         )
         ELSE pg_catalog.format(
           'SELECT %L::text AS constraint_name, %L::text AS child_relation, %L::text AS child_column, %L::text AS parent_relation, %L::text AS parent_column, %L::text AS fk_definition, %L::text AS delete_action, %L::text AS disposition, %L::text AS review_status, NULL::bigint AS referencing_rows;',
           live.constraint_name,
           pg_catalog.format('%I.%I', live.child_schema, live.child_table),
           live.child_column,
           pg_catalog.format('%I.%I', live.parent_schema, live.parent_table),
           live.parent_column,
           live.fk_definition,
           live.delete_action,
           CASE
             WHEN expected.disposition = 'retain' THEN 'RETAINED (reviewed manifest)'
             WHEN expected.disposition = 'disposable'
               AND coalesce(expected.reviewed_disposable, false)
               THEN 'DISPOSABLE (reviewed structure)'
             WHEN expected.constraint_name IS NULL THEN 'RETAINED (default)'
             ELSE 'UNRECOGNIZED RPC DISPOSITION — STOP'
           END,
           'UNCLASSIFIED COMPOSITE FK — STOP'
         )
       END AS generated_read_only_query
FROM live_edges live
LEFT JOIN expected_edges expected
  ON expected.constraint_schema = live.child_schema
 AND expected.constraint_name = live.constraint_name
 AND expected.child_schema = live.child_schema
 AND expected.child_table = live.child_table
 AND expected.child_column = live.child_column
 AND expected.parent_schema = live.parent_schema
 AND expected.parent_table = live.parent_table
 AND expected.parent_column = live.parent_column
 AND expected.delete_action = live.delete_action
 AND expected.constraint_schema = live.child_schema
ORDER BY live.parent_table, live.child_table, live.constraint_name;
\gexec

ROLLBACK;
