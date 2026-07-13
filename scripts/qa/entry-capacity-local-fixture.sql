\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.shows (
  id uuid PRIMARY KEY,
  pre_entry_fee numeric,
  day_of_show_fee numeric,
  start_date date,
  club_id uuid,
  entry_open_date timestamptz,
  entry_close_date timestamptz,
  default_judge_day_capacity integer,
  mail_in_strategy text,
  mail_in_value integer,
  mail_in_auto_release boolean,
  mail_in_release_date date
);

CREATE TABLE public.trials (
  id uuid PRIMARY KEY,
  show_id uuid NOT NULL REFERENCES public.shows(id),
  date date NOT NULL,
  timezone text
);

CREATE TABLE public.classes (
  id uuid PRIMARY KEY,
  trial_id uuid NOT NULL REFERENCES public.trials(id),
  allow_waitlist boolean,
  max_entries integer,
  entry_fee numeric
);

CREATE TABLE public.people (
  id uuid PRIMARY KEY,
  auth_user_id uuid
);

CREATE TABLE public.exhibitor_profiles (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES public.people(id),
  auth_user_id uuid NOT NULL
);

CREATE TABLE public.dogs (
  id uuid PRIMARY KEY,
  owner_id uuid REFERENCES public.people(id),
  co_owner_id uuid REFERENCES public.people(id)
);

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY,
  show_id uuid NOT NULL REFERENCES public.shows(id),
  handler_id uuid NOT NULL REFERENCES public.people(id)
);

CREATE TABLE public.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid,
  trial_id uuid,
  class_id uuid,
  dog_id uuid,
  handler text,
  handler_id uuid,
  entry_fee numeric,
  entry_status text,
  payment_status text DEFAULT 'pending',
  payment_method text,
  submitted_at timestamptz,
  registration_id uuid,
  deleted_at timestamptz,
  jump_height text,
  special_requests text,
  stripe_payment_intent_id text
);

CREATE TABLE public.waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  exhibitor_id uuid NOT NULL,
  dog_id uuid NOT NULL,
  handler_id uuid,
  position integer NOT NULL,
  joined_via text NOT NULL DEFAULT 'online',
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX waitlist_entries_active_class_dog_key
  ON public.waitlist_entries (class_id, dog_id)
  WHERE status IN ('waiting', 'offered');

CREATE UNIQUE INDEX waitlist_entries_class_position_idx
  ON public.waitlist_entries (class_id, position)
  WHERE status = 'waiting';

CREATE TABLE public.judge_assignments (
  class_id uuid,
  show_id uuid,
  person_id uuid,
  status text,
  day_capacity_override integer
);

CREATE TABLE public.entry_submissions (
  id uuid PRIMARY KEY,
  result jsonb NOT NULL
);

CREATE FUNCTION public.is_site_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('test.is_official', true), 'false')::boolean
$$;

CREATE FUNCTION public.is_show_secretary(uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('test.is_official', true), 'false')::boolean
$$;

CREATE FUNCTION public.is_club_admin(uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('test.is_official', true), 'false')::boolean
$$;

CREATE FUNCTION public.get_judge_day_capacity_live(
  p_judge_id uuid,
  p_show_id uuid,
  p_date date
)
RETURNS TABLE (
  judge_id uuid,
  show_date date,
  capacity integer,
  confirmed_count integer,
  waitlist_count integer,
  mail_in_reserved integer,
  available_spots integer,
  class_ids uuid[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capacity integer;
  v_confirmed integer;
  v_reserved integer;
  v_class_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT ja.class_id), ARRAY[]::uuid[])
  INTO v_class_ids
  FROM public.judge_assignments ja
  JOIN public.classes c ON c.id = ja.class_id
  JOIN public.trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed';

  SELECT COALESCE(MAX(ja.day_capacity_override), s.default_judge_day_capacity, 125),
         CASE
           WHEN s.mail_in_strategy = 'fixed' THEN COALESCE(s.mail_in_value, 0)
           WHEN s.mail_in_strategy = 'percentage'
             THEN FLOOR(COALESCE(s.default_judge_day_capacity, 125) * COALESCE(s.mail_in_value, 0) / 100.0)::integer
           ELSE 0
         END
  INTO v_capacity, v_reserved
  FROM public.shows s
  LEFT JOIN public.judge_assignments ja
    ON ja.show_id = s.id AND ja.person_id = p_judge_id
  WHERE s.id = p_show_id
  GROUP BY s.default_judge_day_capacity, s.mail_in_strategy, s.mail_in_value;

  SELECT COUNT(*)::integer
  INTO v_confirmed
  FROM public.entries e
  WHERE e.class_id = ANY(v_class_ids)
    AND e.entry_status IN (
      'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment'
    )
    AND e.deleted_at IS NULL;

  judge_id := p_judge_id;
  show_date := p_date;
  capacity := v_capacity;
  confirmed_count := v_confirmed;
  waitlist_count := 0;
  mail_in_reserved := v_reserved;
  available_spots := GREATEST(0, v_capacity - v_confirmed - v_reserved);
  class_ids := v_class_ids;
  RETURN NEXT;
END;
$$;

INSERT INTO public.shows (
  id, pre_entry_fee, day_of_show_fee, start_date, club_id,
  default_judge_day_capacity, mail_in_strategy, mail_in_value
)
VALUES (
  '00000000-0000-0000-0000-000000000001', 25, 30, '2026-12-01',
  '00000000-0000-0000-0000-000000000099', 2, 'fixed', 1
);

INSERT INTO public.trials (id, show_id, date, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '2026-12-01',
  'America/Chicago'
);

INSERT INTO public.classes (id, trial_id, allow_waitlist, max_entries, entry_fee)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  true,
  5,
  25
);

INSERT INTO public.people (id, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000020', NULL);

INSERT INTO public.exhibitor_profiles (id, person_id, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000011'
);

INSERT INTO public.dogs (id, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000010');

INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010'
);

INSERT INTO public.judge_assignments (class_id, show_id, person_id, status)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000020',
  'confirmed'
);
