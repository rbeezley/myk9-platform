-- MYK9-2291: the two ASCA club-template columns follow the table's effective grants.
--
-- Asserts, against the migrated database (not the migration text):
--   1. both columns exist, are nullable text with no default;
--   2. no column-level ACL on club_premium_templates (the table is table-level only, so the
--      new columns inherit their siblings' permissions);
--   3. anon holds no privilege on either column (or the table);
--   4. authenticated can still SELECT, INSERT and UPDATE both columns;
--   5. RLS is still forced on the table.

BEGIN;

DO $$
DECLARE
  col text;
  priv text;
  col_acl integer;
BEGIN
  FOREACH col IN ARRAY ARRAY['limited_mobility_notes', 'rv_hookup_notes'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'club_premium_templates'
         AND column_name = col AND data_type = 'text'
         AND is_nullable = 'YES' AND column_default IS NULL
    ) THEN
      RAISE EXCEPTION 'FAIL % is not a nullable text column with no default', col;
    END IF;

    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_column_privilege('anon', 'public.club_premium_templates', col, priv) THEN
        RAISE EXCEPTION 'FAIL anon holds % on %', priv, col;
      END IF;
    END LOOP;

    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
      IF NOT has_column_privilege('authenticated', 'public.club_premium_templates', col, priv) THEN
        RAISE EXCEPTION 'FAIL authenticated lost % on %', priv, col;
      END IF;
    END LOOP;
  END LOOP;

  SELECT count(*) INTO col_acl FROM pg_attribute
   WHERE attrelid = 'public.club_premium_templates'::regclass AND attacl IS NOT NULL;
  IF col_acl <> 0 THEN RAISE EXCEPTION 'FAIL % column-level ACLs present', col_acl; END IF;

  IF has_table_privilege('anon', 'public.club_premium_templates', 'SELECT')
     OR has_table_privilege('anon', 'public.club_premium_templates', 'INSERT')
     OR has_table_privilege('anon', 'public.club_premium_templates', 'UPDATE')
     OR has_table_privilege('anon', 'public.club_premium_templates', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL anon holds a table privilege on club_premium_templates';
  END IF;

  IF NOT (has_table_privilege('authenticated', 'public.club_premium_templates', 'SELECT')
          AND has_table_privilege('authenticated', 'public.club_premium_templates', 'INSERT')
          AND has_table_privilege('authenticated', 'public.club_premium_templates', 'UPDATE')
          AND has_table_privilege('authenticated', 'public.club_premium_templates', 'DELETE')) THEN
    RAISE EXCEPTION 'FAIL authenticated lost table CRUD on club_premium_templates';
  END IF;

  IF NOT (SELECT relforcerowsecurity FROM pg_class
           WHERE oid = 'public.club_premium_templates'::regclass) THEN
    RAISE EXCEPTION 'FAIL RLS is not forced on club_premium_templates';
  END IF;

  RAISE NOTICE 'PASS the new columns inherit the table-level grants: no anon access, authenticated intact';
END;
$$;

ROLLBACK;
