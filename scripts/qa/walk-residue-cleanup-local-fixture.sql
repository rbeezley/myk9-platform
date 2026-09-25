-- Throwaway-Postgres fixture for supabase/ops/walk-residue-cleanup.sql
-- (MYK9-734). Run ONLY against a disposable local database: it drops and
-- recreates schema public. scripts/qa/walk-residue-cleanup-local.sh refuses any
-- non-local URL before it gets here.
--
-- A STUB, not the real schema: the tables the cleanup touches, with the
-- foreign-key delete actions the migrations give them (entries.dog_id and
-- entry_status_history cascade; the stripe_orders scope columns and
-- stripe_order_refunds.order_id RESTRICT, 20260915191700; cart, waitlist and
-- armband dog references NO ACTION). It proves the script's own logic --
-- scoping, refusals, the record/apply handshake -- not that the live catalog
-- has no other reference. The live run's pg_constraint survey covers that.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

CREATE TABLE public.people (id uuid PRIMARY KEY, email text NOT NULL);
CREATE TABLE public.shows (id uuid PRIMARY KEY, name text);
CREATE TABLE public.dogs (
  id uuid PRIMARY KEY, name text NOT NULL, owner_id uuid REFERENCES public.people(id),
  updated_at timestamptz NOT NULL DEFAULT '2026-09-13 12:00+00');
CREATE TABLE public.dog_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id uuid NOT NULL REFERENCES public.dogs(id) ON DELETE CASCADE, organization text);
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY, show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE,
  handler_id uuid REFERENCES public.people(id) ON DELETE CASCADE, payment_status text,
  UNIQUE (show_id, handler_id));
CREATE TABLE public.entries (
  id uuid PRIMARY KEY, dog_id uuid REFERENCES public.dogs(id) ON DELETE CASCADE,
  show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES public.enrollments(id),
  payment_status text, entry_fee numeric);
CREATE TABLE public.entry_status_history (
  id uuid PRIMARY KEY, entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  new_status text);
CREATE TABLE public.stripe_orders (
  id uuid PRIMARY KEY, entry_ids uuid[], amount_cents integer NOT NULL,
  show_id uuid REFERENCES public.shows(id) ON DELETE RESTRICT,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE RESTRICT,
  stripe_checkout_session_id text, stripe_payment_intent_id text, status text);
CREATE TABLE public.stripe_order_refunds (
  stripe_refund_id text PRIMARY KEY,
  order_id uuid REFERENCES public.stripe_orders(id) ON DELETE RESTRICT, amount_cents integer);
CREATE TABLE public.entry_cart_items (
  id uuid PRIMARY KEY, dog_id uuid REFERENCES public.dogs(id));
CREATE TABLE public.waitlist_entries (
  id uuid PRIMARY KEY, dog_id uuid REFERENCES public.dogs(id),
  promoted_entry_id uuid REFERENCES public.entries(id) ON DELETE SET NULL);
CREATE TABLE public.armbands (
  id uuid PRIMARY KEY, dog_id uuid REFERENCES public.dogs(id), armband_number text);

INSERT INTO public.people VALUES
  ('00000000-0000-0000-0000-00000000e001', 'exhibitor@myk9t.com'),
  ('00000000-0000-0000-0000-00000000e002', 'exhibitor2@myk9t.com'),
  ('00000000-0000-0000-0000-00000000e003', 'someone-else@example.test');
INSERT INTO public.shows VALUES ('00000000-0000-0000-0000-000000000011', 'Heartland UKC Nosework Trial');

-- The walk account's one enrollment on the show, shared by two runs.
INSERT INTO public.enrollments VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-00000000e001', 'paid');

-- A seeded dog and its entry: never in any run's scope.
INSERT INTO public.dogs (id, name, owner_id) VALUES
  ('00000000-0000-0000-0000-0000000000d0', 'Willow', '00000000-0000-0000-0000-00000000e001');
INSERT INTO public.entries VALUES
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000d0',
   '00000000-0000-0000-0000-000000000011', NULL, 'paid', 30);

-- Another owner's dog that happens to carry a walk-shaped name: out of scope.
INSERT INTO public.dogs (id, name, owner_id) VALUES
  ('00000000-0000-0000-0000-0000000000d9', 'ZZ Walk Dog 2026-09-13 0305 #1', '00000000-0000-0000-0000-00000000e003');

-- Run A, token 2026-09-13 0305: a paid dog with history, an order, a cart line,
-- an armband, a registration; plus an unpaid second dog.
INSERT INTO public.dogs (id, name, owner_id) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'ZZ Walk Dog 2026-09-13 0305 #1', '00000000-0000-0000-0000-00000000e001'),
  ('00000000-0000-0000-0000-0000000000d2', 'ZZ Walk Dog 2026-09-13 0305 #2', '00000000-0000-0000-0000-00000000e001');
INSERT INTO public.dog_registrations (dog_id, organization) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'UKC');
INSERT INTO public.entries VALUES
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000e1', 'paid', 30);
INSERT INTO public.entry_status_history VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'paid');
INSERT INTO public.stripe_orders VALUES
  ('00000000-0000-0000-0000-0000000000c1', ARRAY['00000000-0000-0000-0000-0000000000a1'::uuid], 3000,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000e1',
   'cs_test_runA', 'pi_runA', 'succeeded');
INSERT INTO public.entry_cart_items VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d2');
INSERT INTO public.armbands VALUES
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d1', '300');

-- Run B, token 2026-09-20 0305: same enrollment, its own paid entry and order.
INSERT INTO public.dogs (id, name, owner_id) VALUES
  ('00000000-0000-0000-0000-0000000000d3', 'ZZ Walk Dog 2026-09-20 0305 #1', '00000000-0000-0000-0000-00000000e001');
INSERT INTO public.entries VALUES
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000d3',
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000e1', 'paid', 30);
INSERT INTO public.stripe_orders VALUES
  ('00000000-0000-0000-0000-0000000000c3', ARRAY['00000000-0000-0000-0000-0000000000a3'::uuid], 3000,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000e1',
   'cs_test_runB', 'pi_runB', 'succeeded');

-- Run C, token 2026-09-21 0305: its order ALSO paid for the seeded Willow entry.
INSERT INTO public.dogs (id, name, owner_id) VALUES
  ('00000000-0000-0000-0000-0000000000d4', 'ZZ Walk Dog 2026-09-21 0305 #1', '00000000-0000-0000-0000-00000000e001');
INSERT INTO public.entries VALUES
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-000000000011', NULL, 'paid', 30);
INSERT INTO public.stripe_orders VALUES
  ('00000000-0000-0000-0000-0000000000c4',
   ARRAY['00000000-0000-0000-0000-0000000000a4'::uuid, '00000000-0000-0000-0000-0000000000a0'::uuid], 6000,
   '00000000-0000-0000-0000-000000000011', NULL, 'cs_test_runC', 'pi_runC', 'succeeded');

-- Run D, token 2026-09-22 0305: its order has a refund row.
INSERT INTO public.dogs (id, name, owner_id) VALUES
  ('00000000-0000-0000-0000-0000000000d5', 'ZZ Walk Dog 2026-09-22 0305 #1', '00000000-0000-0000-0000-00000000e001');
INSERT INTO public.entries VALUES
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000d5',
   '00000000-0000-0000-0000-000000000011', NULL, 'refunded', 30);
INSERT INTO public.stripe_orders VALUES
  ('00000000-0000-0000-0000-0000000000c5', ARRAY['00000000-0000-0000-0000-0000000000a5'::uuid], 3000,
   '00000000-0000-0000-0000-000000000011', NULL, 'cs_test_runD', 'pi_runD', 'refunded');
INSERT INTO public.stripe_order_refunds VALUES ('re_runD', '00000000-0000-0000-0000-0000000000c5', 3000);

-- Run E, token 2026-09-23 0305: an unrecorded cascading child (a ledger table
-- this file does not know) holds a row for its entry.
INSERT INTO public.dogs (id, name, owner_id) VALUES
  ('00000000-0000-0000-0000-0000000000d6', 'ZZ Walk Dog 2026-09-23 0305 #1', '00000000-0000-0000-0000-00000000e001');
INSERT INTO public.entries VALUES
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000d6',
   '00000000-0000-0000-0000-000000000011', NULL, 'pending', 30);
CREATE TABLE public.some_future_ledger (
  id uuid PRIMARY KEY, entry_id uuid REFERENCES public.entries(id) ON DELETE CASCADE);
INSERT INTO public.some_future_ledger VALUES
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000a6');
