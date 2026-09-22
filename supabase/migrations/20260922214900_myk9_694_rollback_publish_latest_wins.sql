-- A rollback client publishes through the legacy flat URL and timestamp fields. Clear any
-- newer versioned path so readers observe the last publication, and invalidate
-- versioned attempts that began before the legacy publish.
CREATE OR REPLACE FUNCTION public.clear_versioned_premium_after_legacy_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.published_premium_url IS NOT NULL
     AND NEW.published_premium_at IS DISTINCT FROM OLD.published_premium_at THEN
    NEW.published_premium_path := NULL;
    NEW.published_premium_version := NULL;
    NEW.premium_publish_version := GREATEST(NEW.premium_publish_version, OLD.premium_publish_version) + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_versioned_premium_after_legacy_publish ON public.shows;
CREATE TRIGGER clear_versioned_premium_after_legacy_publish
  BEFORE UPDATE OF published_premium_url ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_versioned_premium_after_legacy_publish();

COMMENT ON FUNCTION public.clear_versioned_premium_after_legacy_publish() IS
  'When a rollback client publishes a non-null legacy premium URL with a new timestamp, invalidate the prior versioned path and in-flight versioned attempts.';
