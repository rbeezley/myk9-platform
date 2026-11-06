-- MYK9-1728: judge supplies belong to the show, not to each trial.
--
-- A judge's supply checklist is one list per show and judge. The old
-- trial_judge_supplies table kept one copy per trial, so a judge who works two
-- trials had two lists to keep in step. show_judge_supplies stores the list
-- once, keyed (show_id, person_id). Per-trial differences are intentionally
-- lost (owner decision, 2026-11-06).
--
-- Existing rows are carried over, deduplicated to one per (show, judge, item)
-- keeping the most recently edited copy, then trial_judge_supplies is dropped.
--
-- Authorization mirrors 20260703124000: can_manage_show() or site admin, for
-- every command. can_manage_show (20261004181900) is the SECURITY DEFINER,
-- club-scoped helper: platform admin, club admin, or trial secretary of the
-- show's club, the same people can_manage_trial admitted. No exhibitor or anon
-- surface reads this table.
--
-- Redefines hard_delete_show from 20261104185300 (MYK9-1694): the
-- trial_judge_supplies_trial_id_fkey manifest row is removed and
-- show_judge_supplies_show_id_fkey is added. The new edge is 'disposable'
-- (planning data, not participant, money or audit evidence); the old trial
-- edge was 'retain', which made a configured checklist block permanent
-- deletion of an otherwise unused show.

CREATE TABLE public.show_judge_supplies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  -- person_id is the canonical link via judge_assignments. judge_name is
  -- denormalized for display and for the legacy case where a class has a judge
  -- name without a judge_assignments row. Keyed by (show_id, person_id) when
  -- person_id is set, and by (show_id, judge_name) when it is null.
  person_id uuid,
  judge_name text NOT NULL,
  item_label text NOT NULL,
  included boolean NOT NULL DEFAULT true,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  -- true if added by the secretary, false if seeded from the registry template.
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT show_judge_supplies_show_id_fkey
    FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE CASCADE,
  CONSTRAINT show_judge_supplies_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL,
  CONSTRAINT show_judge_supplies_judge_name_len CHECK (char_length(judge_name) BETWEEN 1 AND 200),
  CONSTRAINT show_judge_supplies_item_label_len CHECK (char_length(item_label) BETWEEN 1 AND 200),
  CONSTRAINT show_judge_supplies_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

-- Partial unique indexes stop concurrent seeds from duplicating rows; a single
-- UNIQUE would not catch person_id IS NULL because nulls compare unequal.
CREATE UNIQUE INDEX show_judge_supplies_unique_with_person
  ON public.show_judge_supplies (show_id, person_id, lower(item_label))
  WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX show_judge_supplies_unique_no_person
  ON public.show_judge_supplies (show_id, judge_name, lower(item_label))
  WHERE person_id IS NULL;
CREATE INDEX show_judge_supplies_show_judge_idx
  ON public.show_judge_supplies (show_id, person_id, sort_order);
CREATE INDEX show_judge_supplies_show_name_idx
  ON public.show_judge_supplies (show_id, judge_name, sort_order);
CREATE INDEX show_judge_supplies_person_id_fk_idx
  ON public.show_judge_supplies (person_id);

CREATE TRIGGER set_show_judge_supplies_updated_at
  BEFORE UPDATE ON public.show_judge_supplies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Carry the existing rows over: one per (show, judge, item), newest edit wins (ties broken
-- deterministically). Done before RLS is enabled so it never depends on the migration role
-- bypassing RLS.
INSERT INTO public.show_judge_supplies (
  show_id, person_id, judge_name, item_label, included, note, sort_order,
  is_custom, created_at, updated_at
)
SELECT DISTINCT ON (t.show_id, coalesce(s.person_id::text, s.judge_name), lower(s.item_label))
  t.show_id, s.person_id, s.judge_name, s.item_label, s.included, s.note,
  s.sort_order, s.is_custom, s.created_at, s.updated_at
FROM public.trial_judge_supplies AS s
JOIN public.trials AS t ON t.id = s.trial_id
ORDER BY t.show_id, coalesce(s.person_id::text, s.judge_name), lower(s.item_label),
         s.updated_at DESC, s.created_at DESC, s.id;

ALTER TABLE public.show_judge_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_judge_supplies FORCE ROW LEVEL SECURITY;

-- This project's default privileges grant anon full CRUD on new tables: revoke explicitly.
REVOKE ALL ON public.show_judge_supplies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.show_judge_supplies TO authenticated;
GRANT ALL ON public.show_judge_supplies TO service_role;

CREATE POLICY "show_judge_supplies_select" ON public.show_judge_supplies
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_judge_supplies.show_id))
  );

CREATE POLICY "show_judge_supplies_insert" ON public.show_judge_supplies
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_judge_supplies.show_id))
  );

CREATE POLICY "show_judge_supplies_update" ON public.show_judge_supplies
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_judge_supplies.show_id))
  )
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_judge_supplies.show_id))
  );

CREATE POLICY "show_judge_supplies_delete" ON public.show_judge_supplies
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_judge_supplies.show_id))
  );

DROP TABLE public.trial_judge_supplies;

CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Regenerate from pg_constraint when the drift check names an edge. A new
  -- edge is 'retain' unless a reviewer can say why its rows are not
  -- participant, money, delivery or audit evidence. Every 'disposable' edge
  -- must be ON DELETE CASCADE from shows, trials or classes.
  v_fk_manifest CONSTANT pg_catalog.jsonb := $manifest$
  [
    {"constraint_schema" : "public", "constraint_name" : "announcements_show_id_fkey", "child_schema" : "public", "child_table" : "announcements", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "armbands_show_id_fkey", "child_schema" : "public", "child_table" : "armbands", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "calendar_feed_tokens_show_id_fkey", "child_schema" : "public", "child_table" : "calendar_feed_tokens", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "dog_favorites_show_id_fkey", "child_schema" : "public", "child_table" : "dog_favorites", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "dogs_created_from_show_id_fkey", "child_schema" : "public", "child_table" : "dogs", "child_column" : "created_from_show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "email_log_show_id_fkey", "child_schema" : "public", "child_table" : "email_log", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "registrations_show_id_fkey", "child_schema" : "public", "child_table" : "enrollments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entries_show_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_carts_show_id_fkey", "child_schema" : "public", "child_table" : "entry_carts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_form_notes_show_id_fkey", "child_schema" : "public", "child_table" : "entry_form_notes", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_payment_links_show_id_fkey", "child_schema" : "public", "child_table" : "entry_payment_links", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_show_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_show_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "people_created_from_show_id_fkey", "child_schema" : "public", "child_table" : "people", "child_column" : "created_from_show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "premium_generation_attempts_show_id_fkey", "child_schema" : "public", "child_table" : "premium_generation_attempts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "premium_generations_show_id_fkey", "child_schema" : "public", "child_table" : "premium_generations", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "refund_requests_show_id_fkey", "child_schema" : "public", "child_table" : "refund_requests", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "result_submissions_show_id_fkey", "child_schema" : "public", "child_table" : "result_submissions", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "ringside_sessions_show_id_fkey", "child_schema" : "public", "child_table" : "ringside_sessions", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "role_requests_show_id_fkey", "child_schema" : "public", "child_table" : "role_requests", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "secretary_tasks_show_id_fkey", "child_schema" : "public", "child_table" : "secretary_tasks", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_announcements_show_id_fkey", "child_schema" : "public", "child_table" : "show_announcements", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_eve_nudge_log_show_id_fkey", "child_schema" : "public", "child_table" : "show_eve_nudge_log", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_show_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_judge_supplies_show_id_fkey", "child_schema" : "public", "child_table" : "show_judge_supplies", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_jobs_show_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_jobs", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_steps_show_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_steps", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_message_threads_show_id_fkey", "child_schema" : "public", "child_table" : "show_message_threads", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_messages_show_id_fkey", "child_schema" : "public", "child_table" : "show_messages", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_money_locks_show_id_fkey", "child_schema" : "public", "child_table" : "show_money_locks", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_officials_show_id_fkey", "child_schema" : "public", "child_table" : "show_officials", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_passcodes_show_id_fkey", "child_schema" : "public", "child_table" : "show_passcodes", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_payments_show_id_fkey", "child_schema" : "public", "child_table" : "show_payments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_payouts_show_id_fkey", "child_schema" : "public", "child_table" : "show_payouts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_visibility_settings_show_id_fkey", "child_schema" : "public", "child_table" : "show_visibility_settings", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "stripe_orders_show_id_fkey", "child_schema" : "public", "child_table" : "stripe_orders", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "support_tickets_show_id_fkey", "child_schema" : "public", "child_table" : "support_tickets", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_generation_claims_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_generation_claims", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_print_reminders_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_print_reminders", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_snapshots_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_snapshots", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trials_show_id_fkey", "child_schema" : "public", "child_table" : "trials", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "user_roles_show_id_fkey", "child_schema" : "public", "child_table" : "user_roles", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_general_assignments_show_id_fkey", "child_schema" : "public", "child_table" : "volunteer_general_assignments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "volunteers_show_id_fkey", "child_schema" : "public", "child_table" : "volunteers", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "activity_log_trial_id_fkey", "child_schema" : "public", "child_table" : "activity_log", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "announcements_trial_id_fkey", "child_schema" : "public", "child_table" : "announcements", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "armbands_trial_id_fkey", "child_schema" : "public", "child_table" : "armbands", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "classes_trial_id_fkey", "child_schema" : "public", "child_table" : "classes", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "entries_trial_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_trial_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_trial_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "result_submissions_trial_id_fkey", "child_schema" : "public", "child_table" : "result_submissions", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_trial_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_checklist_state_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_checklist_state", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_lunch_orders_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_lunch_orders", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "trial_visibility_overrides_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_visibility_overrides", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_general_assignments_trial_id_fkey", "child_schema" : "public", "child_table" : "volunteer_general_assignments", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "cart_spot_holds_class_id_fkey", "child_schema" : "public", "child_table" : "cart_spot_holds", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "class_visibility_overrides_class_id_fkey", "child_schema" : "public", "child_table" : "class_visibility_overrides", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "entries_class_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_cart_items_class_id_fkey", "child_schema" : "public", "child_table" : "entry_cart_items", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "NO ACTION", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_class_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_class_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_class_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_class_assignments_class_id_fkey", "child_schema" : "public", "child_table" : "volunteer_class_assignments", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "waitlist_entries_class_id_fkey", "child_schema" : "public", "child_table" : "waitlist_entries", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_jobs_step_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_jobs", "child_column" : "step_id", "parent_schema" : "public", "parent_table" : "show_lifecycle_email_steps", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "ringside_sessions_show_passcode_id_fkey", "child_schema" : "public", "child_table" : "ringside_sessions", "child_column" : "show_passcode_id", "parent_schema" : "public", "parent_table" : "show_passcodes", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"}
  ]
  $manifest$::pg_catalog.jsonb;
  v_edge record;
  v_fk_drift text;
  v_orders integer;
  v_has_retained_child boolean;
  v_parent_scope text;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied: only site administrators can permanently delete shows'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_recent_reauth();

  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);

  -- SHARE UPDATE EXCLUSIVE conflicts with itself and with ADD FOREIGN KEY on
  -- the referenced table, but not with ordinary DML: two permanent deletes
  -- serialize, and the FK graph cannot change under the check below.
  LOCK TABLE public.classes IN SHARE UPDATE EXCLUSIVE MODE;
  LOCK TABLE public.trials IN SHARE UPDATE EXCLUSIVE MODE;
  LOCK TABLE public.shows IN SHARE UPDATE EXCLUSIVE MODE;
  -- Every other table the cascade sweeps, read from the manifest so a new
  -- disposable edge is locked too: otherwise a foreign key added to, say,
  -- show_passcodes could commit after the catalog check and the cascade would
  -- follow an unreviewed edge. A table missing from the catalog is skipped
  -- here and reported by the drift check below.
  FOR v_edge IN
    SELECT DISTINCT manifest.child_schema, manifest.child_table
    FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      child_schema text, child_table text, disposition text
    )
    WHERE manifest.disposition = 'disposable'
      AND manifest.child_table NOT IN ('shows', 'trials', 'classes')
      AND pg_catalog.to_regclass(
        pg_catalog.format('%I.%I', manifest.child_schema, manifest.child_table)
      ) IS NOT NULL
    ORDER BY manifest.child_schema, manifest.child_table
  LOOP
    EXECUTE pg_catalog.format(
      'LOCK TABLE %I.%I IN SHARE UPDATE EXCLUSIVE MODE', v_edge.child_schema, v_edge.child_table
    );
  END LOOP;

  PERFORM 1 FROM public.shows WHERE id = p_show_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.trials WHERE show_id = p_show_id ORDER BY id FOR UPDATE;
  PERFORM 1
  FROM public.classes AS c
  JOIN public.trials AS t ON t.id = c.trial_id
  WHERE t.show_id = p_show_id
  ORDER BY c.id
  FOR UPDATE OF c;

  -- Both directions, so a missing, extra, renamed, retargeted, re-columned or
  -- action-changed constraint refuses before any row is read or deleted. The
  -- parents checked are shows/trials/classes plus every table a disposable
  -- edge sweeps, so a table hanging off a swept table is covered too.
  WITH reviewed AS (
    SELECT * FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      constraint_schema text, constraint_name text, child_schema text, child_table text,
      child_column text, parent_schema text, parent_table text, parent_column text,
      delete_action text, disposition text
    )
  ), swept AS (
    SELECT pg_catalog.to_regclass('public.shows') AS rel
    UNION SELECT pg_catalog.to_regclass(pg_catalog.format('%I.%I', child_schema, child_table))
    FROM reviewed WHERE disposition = 'disposable'
  ), actual AS (
    SELECT constraint_ns.nspname AS constraint_schema, c.conname AS constraint_name,
           child_ns.nspname AS child_schema, child.relname AS child_table,
           child_col.attname AS child_column, parent_ns.nspname AS parent_schema,
           parent.relname AS parent_table, parent_col.attname AS parent_column,
           CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
             WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
             WHEN 'd' THEN 'SET DEFAULT' END AS delete_action
    FROM pg_catalog.pg_constraint AS c
    JOIN pg_catalog.pg_namespace AS constraint_ns ON constraint_ns.oid = c.connamespace
    JOIN pg_catalog.pg_class AS child ON child.oid = c.conrelid
    JOIN pg_catalog.pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_catalog.pg_class AS parent ON parent.oid = c.confrelid
    JOIN pg_catalog.pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
    CROSS JOIN LATERAL pg_catalog.unnest(c.conkey) WITH ORDINALITY AS child_key(attnum, ordinality)
    JOIN LATERAL pg_catalog.unnest(c.confkey) WITH ORDINALITY AS parent_key(attnum, ordinality)
      ON parent_key.ordinality = child_key.ordinality
    JOIN pg_catalog.pg_attribute AS child_col
      ON child_col.attrelid = child.oid AND child_col.attnum = child_key.attnum
    JOIN pg_catalog.pg_attribute AS parent_col
      ON parent_col.attrelid = parent.oid AND parent_col.attnum = parent_key.attnum
    WHERE c.contype = 'f'
      AND c.confrelid IN (SELECT rel FROM swept WHERE rel IS NOT NULL)
  ), delta AS (
    (SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM actual
     EXCEPT
     SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM reviewed)
    UNION ALL
    (SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM reviewed
     EXCEPT
     SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM actual)
    UNION ALL
    -- A disposable edge is swept by the cascade from a show, trial or class;
    -- anything else would leave rows behind or fail at the final DELETE.
    SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
           parent_schema, parent_table, parent_column, delete_action
    FROM reviewed
    WHERE disposition = 'disposable'
      AND (delete_action <> 'CASCADE' OR parent_table NOT IN ('shows', 'trials', 'classes'))
  )
  SELECT pg_catalog.string_agg(
    DISTINCT constraint_schema || '.' || constraint_name, ', '
    ORDER BY constraint_schema || '.' || constraint_name
  ) INTO v_fk_drift
  FROM delta;

  IF v_fk_drift IS NOT NULL THEN
    RAISE EXCEPTION 'Permanent deletion is refused: foreign key(s) % changed since hard_delete_show was last reviewed. No data was deleted.', v_fk_drift
      USING ERRCODE = 'MK615',
            HINT = 'Classify the edge in the hard_delete_show manifest before deleting.';
  END IF;

  -- MYK9-527's readable refusal, kept verbatim: either column alone ties an
  -- order to this show.
  SELECT pg_catalog.count(*) INTO v_orders
  FROM public.stripe_orders AS so
  WHERE so.show_id = p_show_id
     OR so.enrollment_id IN (SELECT e.id FROM public.enrollments AS e WHERE e.show_id = p_show_id);

  IF v_orders > 0 THEN
    RAISE EXCEPTION
      'This show has % Stripe order(s); refunds and reconciliation still reference them. Permanent deletion is refused. Resolve or reassign those orders first.', v_orders
      USING ERRCODE = 'MK615';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.entries AS e
    WHERE e.show_id IS DISTINCT FROM p_show_id
      AND (e.trial_id IN (SELECT t.id FROM public.trials AS t WHERE t.show_id = p_show_id)
        OR e.class_id IN (
          SELECT c.id FROM public.classes AS c
          JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
        )
        OR e.registration_id IN (SELECT r.id FROM public.enrollments AS r WHERE r.show_id = p_show_id))
  ) THEN
    RAISE EXCEPTION 'Permanent deletion is refused: an entry in another show points at this show''s trials, classes or enrollments.'
      USING ERRCODE = 'MK615';
  END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments AS r WHERE r.show_id = p_show_id)
     OR EXISTS (
       SELECT 1 FROM public.entries AS e
       WHERE e.show_id = p_show_id
          OR e.trial_id IN (SELECT t.id FROM public.trials AS t WHERE t.show_id = p_show_id)
          OR e.class_id IN (
            SELECT c.id FROM public.classes AS c
            JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
          )
     ) THEN
    RAISE EXCEPTION 'This show has entries or enrollments, so it cannot be permanently deleted. Permanent deletion is limited to unused shows; keep it in the trash instead.'
      USING ERRCODE = 'MK615';
  END IF;

  -- Money and delivery rows that name the show without a foreign key, so
  -- pg_constraint cannot see them.
  IF EXISTS (SELECT 1 FROM public.cart_fulfillments AS f WHERE f.show_id = p_show_id)
     OR EXISTS (
       SELECT 1 FROM public.cart_fulfillment_lines AS l
       WHERE l.trial_id IN (SELECT t.id FROM public.trials AS t WHERE t.show_id = p_show_id)
          OR l.class_id IN (
            SELECT c.id FROM public.classes AS c
            JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
          )
     ) THEN
    RAISE EXCEPTION 'This show has checkout fulfillment records in public.cart_fulfillments that must be kept for reconciliation, so it cannot be permanently deleted.'
      USING ERRCODE = 'MK615';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.show_lifecycle_email_job_requests AS q WHERE q.show_id = p_show_id
  ) THEN
    RAISE EXCEPTION 'This show has email delivery records in public.show_lifecycle_email_job_requests that must be kept, so it cannot be permanently deleted.'
      USING ERRCODE = 'MK615';
  END IF;
  -- "Results Posted" push state, keyed by class with no foreign key: a delete
  -- would orphan it and private.retry_class_results_push would keep retrying.
  IF EXISTS (
    SELECT 1 FROM private.class_results_push AS p
    WHERE p.class_id IN (
      SELECT c.id FROM public.classes AS c
      JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
    )
  ) THEN
    RAISE EXCEPTION 'This show has results push delivery records in private.class_results_push that must be kept, so it cannot be permanently deleted.'
      USING ERRCODE = 'MK615';
  END IF;

  -- Identifiers come only from the constant manifest (already proven equal to
  -- the catalog) and pass through %I; the show id is bound with USING.
  FOR v_edge IN
    SELECT * FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      constraint_schema text, constraint_name text, child_schema text, child_table text,
      child_column text, parent_schema text, parent_table text, parent_column text,
      delete_action text, disposition text
    )
    WHERE disposition = 'retain'
    ORDER BY parent_table, child_table, constraint_name
  LOOP
    IF v_edge.parent_table = 'shows' THEN
      v_parent_scope := 'SELECT $1';
    ELSIF v_edge.parent_table = 'trials' THEN
      v_parent_scope := 'SELECT target_trial.id FROM public.trials AS target_trial '
        'WHERE target_trial.show_id = $1';
    ELSIF v_edge.parent_table = 'classes' THEN
      v_parent_scope := 'SELECT target_class.id FROM public.classes AS target_class '
        'JOIN public.trials AS target_trial ON target_trial.id = target_class.trial_id '
        'WHERE target_trial.show_id = $1';
    ELSE
      -- A swept configuration table: the parent rows in scope are the ones its
      -- disposable edges would cascade away.
      SELECT pg_catalog.format(
        'SELECT swept.%I FROM %I.%I AS swept WHERE %s',
        v_edge.parent_column, v_edge.parent_schema, v_edge.parent_table,
        pg_catalog.string_agg(
          pg_catalog.format('swept.%I IN (%s)', d.child_column,
            CASE d.parent_table
              WHEN 'shows' THEN 'SELECT $1'
              WHEN 'trials' THEN 'SELECT t.id FROM public.trials AS t WHERE t.show_id = $1'
              ELSE 'SELECT c.id FROM public.classes AS c JOIN public.trials AS t '
                   'ON t.id = c.trial_id WHERE t.show_id = $1'
            END),
          ' OR ' ORDER BY d.constraint_name)
      ) INTO v_parent_scope
      FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS d(
        constraint_name text, child_schema text, child_table text, child_column text,
        parent_table text, disposition text
      )
      WHERE d.disposition = 'disposable'
        AND d.child_schema = v_edge.parent_schema
        AND d.child_table = v_edge.parent_table;
    END IF;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I AS child WHERE child.%I IN (%s))',
      v_edge.child_schema, v_edge.child_table, v_edge.child_column, v_parent_scope
    ) INTO v_has_retained_child USING p_show_id;

    IF v_has_retained_child THEN
      RAISE EXCEPTION 'This show has records in %.% that must be kept for history and reconciliation, so it cannot be permanently deleted. Permanent deletion is limited to unused shows.',
        v_edge.child_schema, v_edge.child_table
        USING ERRCODE = 'MK615',
              DETAIL = pg_catalog.format('Blocking foreign key: %s.%s', v_edge.constraint_schema, v_edge.constraint_name);
    END IF;
  END LOOP;

  -- Classes first so their cascades run while the trials still exist; the
  -- show's own delete then sweeps the remaining disposable configuration.
  DELETE FROM public.classes AS c
  USING public.trials AS t
  WHERE t.id = c.trial_id AND t.show_id = p_show_id;
  DELETE FROM public.trials WHERE show_id = p_show_id;
  DELETE FROM public.shows WHERE id = p_show_id;
EXCEPTION
  WHEN deadlock_detected THEN
    RAISE;
  WHEN lock_not_available THEN
    RAISE EXCEPTION
      'The show could not be deleted because the database was busy; no data was deleted. Try again in a quiet moment.'
      USING ERRCODE = '55P03';
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_show(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_show(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
