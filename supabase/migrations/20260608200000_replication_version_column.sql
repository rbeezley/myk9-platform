-- Add server-side version column to all replicated tables for OCC (optimistic
-- concurrency control). Each UPDATE carries WHERE version = <client_snapshot>
-- so a concurrent server write (version bumped by trigger) causes 0-row
-- rejection instead of silent last-write-wins.
--
-- All existing rows default to version 1.
-- The trigger increments version on BEFORE UPDATE, so the client does NOT
-- need to include version in the UPDATE payload — only the WHERE precondition.

-- ─── Version column ──────────────────────────────────────────────────────────

ALTER TABLE public.clubs            ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.shows            ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.trials           ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.classes          ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.entries          ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.dogs             ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.judge_assignments ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.armbands         ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.waitlist_entries  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- ─── Increment trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_replication_version()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE TRIGGER (PG14+) makes these idempotent on re-run.
CREATE OR REPLACE TRIGGER clubs_version_increment
  BEFORE UPDATE ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

CREATE OR REPLACE TRIGGER shows_version_increment
  BEFORE UPDATE ON public.shows
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

CREATE OR REPLACE TRIGGER trials_version_increment
  BEFORE UPDATE ON public.trials
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

CREATE OR REPLACE TRIGGER classes_version_increment
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

CREATE OR REPLACE TRIGGER entries_version_increment
  BEFORE UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

CREATE OR REPLACE TRIGGER dogs_version_increment
  BEFORE UPDATE ON public.dogs
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

CREATE OR REPLACE TRIGGER judge_assignments_version_increment
  BEFORE UPDATE ON public.judge_assignments
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

CREATE OR REPLACE TRIGGER armbands_version_increment
  BEFORE UPDATE ON public.armbands
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

CREATE OR REPLACE TRIGGER waitlist_entries_version_increment
  BEFORE UPDATE ON public.waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();
