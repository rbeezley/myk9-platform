-- MYK9-2292: people.judge_affiliation follows its sibling columns' effective access.
--
-- Asserts, against the migrated database (not the migration text):
--   1. the column exists as nullable text with no default;
--   2. anon holds no privilege on it, and every privilege anon and authenticated hold on the
--      sibling `city` column they hold on it too (so anon gains nothing it cannot read today);
--   3. authenticated can SELECT, INSERT and UPDATE it;
--   4. it carries no column-level ACL of its own (it inherits the table-level grants);
--   5. update_person_details names the column, is callable by authenticated, and not by anon;
--   6. the 200-character length check exists.

BEGIN;

DO $$
DECLARE
  priv text;
  role_name text;
  col_acl text;
  fn regprocedure := 'public.update_person_details(uuid, jsonb, jsonb, boolean)'::regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'people'
       AND column_name = 'judge_affiliation' AND data_type = 'text'
       AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL judge_affiliation is not a nullable text column with no default';
  END IF;

  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_column_privilege(role_name, 'public.people', 'judge_affiliation', priv)
         IS DISTINCT FROM has_column_privilege(role_name, 'public.people', 'city', priv) THEN
        RAISE EXCEPTION 'FAIL % % on judge_affiliation differs from its sibling city', role_name, priv;
      END IF;
    END LOOP;
  END LOOP;

  IF has_column_privilege('anon', 'public.people', 'judge_affiliation', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon can read people.judge_affiliation';
  END IF;

  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.people', 'judge_affiliation', priv) THEN
      RAISE EXCEPTION 'FAIL authenticated lacks % on judge_affiliation', priv;
    END IF;
  END LOOP;

  SELECT attacl::text INTO col_acl FROM pg_attribute
   WHERE attrelid = 'public.people'::regclass AND attname = 'judge_affiliation';
  IF col_acl IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL judge_affiliation carries a column-level ACL: %', col_acl;
  END IF;

  IF position('judge_affiliation' IN pg_get_functiondef(fn)) = 0 THEN
    RAISE EXCEPTION 'FAIL update_person_details does not name judge_affiliation';
  END IF;
  IF has_function_privilege('anon', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute update_person_details';
  END IF;
  IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute update_person_details';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.people'::regclass AND conname = 'people_judge_affiliation_length'
       AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%200%'
  ) THEN
    RAISE EXCEPTION 'FAIL the 200-character length check is missing';
  END IF;

  RAISE NOTICE 'PASS judge_affiliation mirrors city access: no anon read, authenticated intact';
END;
$$;

ROLLBACK;
