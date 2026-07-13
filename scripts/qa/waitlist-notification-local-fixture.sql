\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$$;

CREATE SCHEMA vault;
CREATE SCHEMA net;
CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text);
CREATE TABLE net.captured_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url text NOT NULL,
  headers jsonb NOT NULL,
  body jsonb NOT NULL
);
CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb)
RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO net.captured_requests(url, headers, body)
  VALUES (url, headers, body)
  RETURNING id
$$;

INSERT INTO vault.decrypted_secrets(name, decrypted_secret) VALUES
  ('edge_function_base_url', 'https://project.supabase.co/functions/v1'),
  ('push_webhook_secret', 'dedicated-secret');

CREATE TABLE public.waitlist_entries (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  joined_via text,
  offered_at timestamptz,
  offer_expires_at timestamptz,
  promoted_entry_id uuid
);

CREATE TABLE public.entries (
  id uuid PRIMARY KEY,
  entry_status text,
  payment_status text
);
