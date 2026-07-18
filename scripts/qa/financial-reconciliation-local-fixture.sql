-- Minimal scratch-Postgres fixture for the MYK9-54 financial SQL (MYK9-54).
--
-- Creates ONLY what migrations 20260717120000 + 20260717130000 need in order to
-- apply and run: the Supabase roles, the three tables they touch (columns copied
-- from the real DDL in 005, 20260609120000, 132, 20260615170000), and toggleable
-- stubs for the three authorization predicates.
--
-- Run by scripts/qa/run-financial-sql-tests.sh against a throwaway cluster.
-- Never run this against a real database.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$$;

-- ── Tables (real column shapes; unrelated columns omitted) ──────────────────

CREATE TABLE public.shows (
  id       uuid PRIMARY KEY,
  name     text,
  club_id  uuid
);

-- 005_myk9show_specific.sql: stripe_orders. The snapshot columns are NOT
-- declared here — migration 20260717120000 must add them itself.
CREATE TABLE public.stripe_orders (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                uuid,
  stripe_payment_intent_id   text UNIQUE,
  stripe_checkout_session_id text,
  amount_cents               integer NOT NULL,
  currency                   text DEFAULT 'usd',
  status                     text DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled')),
  order_type                 text,
  metadata                   jsonb,
  show_id                    uuid REFERENCES public.shows(id) ON DELETE SET NULL,
  entry_ids                  uuid[],
  enrollment_id              uuid,          -- migration 132
  paid_at                    timestamptz,
  refunded_at                timestamptz,
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);

-- 20260615170000_stripe_orders_session_id_unique.sql
CREATE UNIQUE INDEX stripe_orders_checkout_session_id_key
  ON public.stripe_orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- 20260609120000_stripe_connect_payouts.sql: show_payouts
CREATE TABLE public.show_payouts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id                uuid NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  club_stripe_account_id uuid,
  amount_cents           integer NOT NULL CHECK (amount_cents >= 0),
  status                 text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  stripe_transfer_id     text,
  scheduled_date         date,
  failure_reason         text,
  completed_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- THE supersession rule the summary relies on: at most one live row per show.
CREATE UNIQUE INDEX show_payouts_one_live_per_show
  ON public.show_payouts (show_id) WHERE status <> 'failed';

-- ── Toggleable authorization stubs ─────────────────────────────────────────
-- The real predicates live in earlier migrations and consult RBAC tables. Here
-- they read a GUC so a test can flip authorization on and off:
--   SET test.authorized = 'off';
-- Default (unset) is authorized, so the accounting assertions need no ceremony.

CREATE FUNCTION public._test_authorized() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.authorized', true), 'on') <> 'off'
$$;

CREATE FUNCTION public.is_site_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT public._test_authorized() $$;

CREATE FUNCTION public.is_club_admin(p_club_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT p_club_id IS NOT NULL AND public._test_authorized() $$;

CREATE FUNCTION public.can_manage_show(p_show_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT p_show_id IS NOT NULL AND public._test_authorized() $$;

-- ── Assertion helpers ──────────────────────────────────────────────────────

CREATE FUNCTION public.test_eq(actual bigint, expected bigint, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL % — expected %, got % (diff %)',
      label, expected, actual, COALESCE(actual, 0) - COALESCE(expected, 0);
  END IF;
  RAISE NOTICE '  ok  % = %', label, expected;
END;
$$;

CREATE FUNCTION public.test_true(cond boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL % — expected true, got %', label, COALESCE(cond::text, 'null');
  END IF;
  RAISE NOTICE '  ok  %', label;
END;
$$;
