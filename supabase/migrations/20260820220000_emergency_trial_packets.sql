-- MYK9-198: immutable, private emergency trial packet snapshots.
--
-- The useful artifact must exist outside the app before a show-day failure.
-- Objects remain private; the delivery Edge Function creates a bounded signed
-- link and emails only server-derived show officials. App clients can create a
-- new immutable object but cannot read, replace, or delete packet objects.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('trial-packets', 'trial-packets', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.trial_packet_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL,
  show_id UUID NOT NULL REFERENCES public.shows(id) ON DELETE RESTRICT,
  storage_path TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  generated_by UUID NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  page_count INTEGER NOT NULL CHECK (page_count > 0),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 20971520),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  recipient_count INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  provider_message_id TEXT,
  delivered_at TIMESTAMPTZ,
  signed_link_expires_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trial_packet_storage_path_matches_show CHECK (
    split_part(storage_path, '/', 1) = show_id::text
  )
);

COMMENT ON TABLE public.trial_packet_snapshots IS
  'Append-only delivery-attempt audit for immutable emergency paper fallback PDFs.';
COMMENT ON COLUMN public.trial_packet_snapshots.snapshot_id IS
  'Stable packet object identity. Several append-only rows may exist when email delivery is retried.';
COMMENT ON COLUMN public.trial_packet_snapshots.storage_path IS
  'Private Storage path <show_id>/<snapshot_uuid>.pdf; signed tokens are never persisted here.';
COMMENT ON COLUMN public.trial_packet_snapshots.delivery_status IS
  'Server-written email delivery attempt state. Sent does not mean physically printed.';

CREATE INDEX trial_packet_snapshots_show_generated_idx
  ON public.trial_packet_snapshots (show_id, generated_at DESC);
CREATE INDEX trial_packet_snapshots_snapshot_idx
  ON public.trial_packet_snapshots (snapshot_id, created_at DESC);

ALTER TABLE public.trial_packet_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_packet_snapshots FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.trial_packet_snapshots FROM anon, authenticated;
GRANT SELECT ON TABLE public.trial_packet_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trial_packet_snapshots TO service_role;

DROP POLICY IF EXISTS "Show managers can read trial packet snapshots"
  ON public.trial_packet_snapshots;
CREATE POLICY "Show managers can read trial packet snapshots"
ON public.trial_packet_snapshots FOR SELECT
TO authenticated
USING (
  (SELECT can_manage_show(show_id))
  OR (SELECT is_show_secretary(show_id))
);

-- No INSERT, UPDATE, or DELETE policies: metadata is service-role-only and
-- append-only. A failed delivery is a new immutable audit fact, not an app-side
-- optimistic state transition.

DROP POLICY IF EXISTS "Show managers can upload emergency trial packets"
  ON storage.objects;
CREATE POLICY "Show managers can upload emergency trial packets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trial-packets'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN (
      (SELECT can_manage_show(((storage.foldername(name))[1])::uuid))
      OR (SELECT is_show_secretary(((storage.foldername(name))[1])::uuid))
    )
    ELSE false
  END
);

-- Deliberately no public/anon/authenticated SELECT, UPDATE, or DELETE policy on
-- trial-packets. The service-role delivery function verifies the exact object
-- and mints a time-bounded signed URL for out-of-band retrieval.
