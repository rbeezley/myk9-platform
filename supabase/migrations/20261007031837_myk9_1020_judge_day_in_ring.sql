-- MYK9-1020: keep the judge-day summary's taken count aligned with
-- get_judge_day_capacity_live while an entry is in the ring.
-- This is the latest view shape from 20261005031700, including held spots.
CREATE OR REPLACE VIEW public.judge_day_summary (
  show_id, judge_id, judge_name, show_date, class_ids, class_names,
  confirmed_count, waitlist_count
)
WITH (security_invoker = true)
AS
SELECT ja.show_id,
    ja.person_id AS judge_id,
    (p.first_name || ' '::text) || p.last_name AS judge_name,
    t.date AS show_date,
    array_agg(DISTINCT c.id) AS class_ids,
    array_agg(DISTINCT c.name) AS class_names,
    count(DISTINCT e.id) FILTER (
      WHERE e.entry_status = ANY (ARRAY[
        'submitted'::text, 'paid'::text, 'confirmed'::text,
        'checked-in'::text, 'competing'::text, 'in-ring'::text,
        'pending-payment'::text
      ]) AND e.deleted_at IS NULL
    ) + public.manager_held_spot_count(ja.show_id, array_agg(DISTINCT c.id)) AS confirmed_count,
    count(DISTINCT we.id) FILTER (WHERE we.status = 'waiting'::text) AS waitlist_count
FROM public.judge_assignments ja
JOIN public.people p ON p.id = ja.person_id
JOIN public.classes c ON c.id = ja.class_id
JOIN public.trials t ON t.id = c.trial_id
LEFT JOIN public.entries e ON e.class_id = c.id
LEFT JOIN public.waitlist_entries we ON we.class_id = c.id
WHERE ja.status = 'confirmed'::text
GROUP BY ja.show_id, ja.person_id, p.first_name, p.last_name, t.date;

REVOKE ALL ON public.judge_day_summary FROM anon;
GRANT SELECT ON public.judge_day_summary TO authenticated;
