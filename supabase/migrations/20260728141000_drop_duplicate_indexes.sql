-- MYK9-113: remove only the two reviewed exact duplicate indexes.
--
-- Guard the physical signatures before any destructive statement. An absent
-- redundant twin is already converged; an absent survivor or changed twin
-- fails closed.

DO $$
BEGIN
  IF to_regclass('public.platform_waitlist_email_key') IS NULL THEN
    RAISE EXCEPTION 'canonical index public.platform_waitlist_email_key is missing';
  END IF;

  IF to_regclass('public.platform_waitlist_email_unique') IS NOT NULL THEN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index keep_index
        JOIN pg_class keep_class ON keep_class.oid = keep_index.indexrelid
        JOIN pg_index drop_index
          ON drop_index.indexrelid = 'public.platform_waitlist_email_unique'::regclass
        JOIN pg_class drop_class ON drop_class.oid = drop_index.indexrelid
        WHERE keep_index.indexrelid = 'public.platform_waitlist_email_key'::regclass
          AND keep_index.indisvalid
          AND keep_index.indisready
          AND keep_index.indislive
          AND drop_index.indisvalid
          AND drop_index.indisready
          AND drop_index.indislive
          AND keep_index.indrelid = drop_index.indrelid
          AND keep_class.relam = drop_class.relam
          AND keep_class.reltablespace = drop_class.reltablespace
          AND keep_class.reloptions IS NOT DISTINCT FROM drop_class.reloptions
          AND keep_index.indisunique = drop_index.indisunique
          AND keep_index.indnullsnotdistinct = drop_index.indnullsnotdistinct
          AND keep_index.indisprimary = drop_index.indisprimary
          AND keep_index.indisexclusion = drop_index.indisexclusion
          AND keep_index.indimmediate = drop_index.indimmediate
          AND keep_index.indisclustered = drop_index.indisclustered
          AND keep_index.indisreplident = drop_index.indisreplident
          AND keep_index.indnkeyatts = drop_index.indnkeyatts
          AND keep_index.indnatts = drop_index.indnatts
          AND keep_index.indkey = drop_index.indkey
          AND keep_index.indclass = drop_index.indclass
          AND keep_index.indcollation = drop_index.indcollation
          AND keep_index.indoption = drop_index.indoption
          AND coalesce(keep_index.indexprs::text, '') =
              coalesce(drop_index.indexprs::text, '')
          AND coalesce(keep_index.indpred::text, '') =
              coalesce(drop_index.indpred::text, '')
      )
    THEN
      RAISE EXCEPTION
        'refusing to drop public.platform_waitlist_email_unique: definition differs from canonical index';
    END IF;
  END IF;

  IF to_regclass('public.idx_push_subscriptions_user_id') IS NULL THEN
    RAISE EXCEPTION 'canonical index public.idx_push_subscriptions_user_id is missing';
  END IF;

  IF to_regclass('public.push_subscriptions_user_id_idx') IS NOT NULL THEN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index keep_index
        JOIN pg_class keep_class ON keep_class.oid = keep_index.indexrelid
        JOIN pg_index drop_index
          ON drop_index.indexrelid = 'public.push_subscriptions_user_id_idx'::regclass
        JOIN pg_class drop_class ON drop_class.oid = drop_index.indexrelid
        WHERE keep_index.indexrelid = 'public.idx_push_subscriptions_user_id'::regclass
          AND keep_index.indisvalid
          AND keep_index.indisready
          AND keep_index.indislive
          AND drop_index.indisvalid
          AND drop_index.indisready
          AND drop_index.indislive
          AND keep_index.indrelid = drop_index.indrelid
          AND keep_class.relam = drop_class.relam
          AND keep_class.reltablespace = drop_class.reltablespace
          AND keep_class.reloptions IS NOT DISTINCT FROM drop_class.reloptions
          AND keep_index.indisunique = drop_index.indisunique
          AND keep_index.indnullsnotdistinct = drop_index.indnullsnotdistinct
          AND keep_index.indisprimary = drop_index.indisprimary
          AND keep_index.indisexclusion = drop_index.indisexclusion
          AND keep_index.indimmediate = drop_index.indimmediate
          AND keep_index.indisclustered = drop_index.indisclustered
          AND keep_index.indisreplident = drop_index.indisreplident
          AND keep_index.indnkeyatts = drop_index.indnkeyatts
          AND keep_index.indnatts = drop_index.indnatts
          AND keep_index.indkey = drop_index.indkey
          AND keep_index.indclass = drop_index.indclass
          AND keep_index.indcollation = drop_index.indcollation
          AND keep_index.indoption = drop_index.indoption
          AND coalesce(keep_index.indexprs::text, '') =
              coalesce(drop_index.indexprs::text, '')
          AND coalesce(keep_index.indpred::text, '') =
              coalesce(drop_index.indpred::text, '')
      )
    THEN
      RAISE EXCEPTION
        'refusing to drop public.push_subscriptions_user_id_idx: definition differs from canonical index';
    END IF;
  END IF;
END
$$;

DROP INDEX IF EXISTS public.platform_waitlist_email_unique;
DROP INDEX IF EXISTS public.push_subscriptions_user_id_idx;

DO $$
BEGIN
  IF to_regclass('public.platform_waitlist_email_key') IS NULL
    OR to_regclass('public.idx_push_subscriptions_user_id') IS NULL
  THEN
    RAISE EXCEPTION 'canonical duplicate-index survivor is missing';
  END IF;

  IF (
      SELECT count(*)
      FROM pg_index
      WHERE indexrelid IN (
        'public.platform_waitlist_email_key'::regclass,
        'public.idx_push_subscriptions_user_id'::regclass
      )
        AND indisvalid
        AND indisready
    ) <> 2
  THEN
    RAISE EXCEPTION 'canonical duplicate-index survivor is invalid or not ready';
  END IF;

  IF to_regclass('public.platform_waitlist_email_unique') IS NOT NULL
    OR to_regclass('public.push_subscriptions_user_id_idx') IS NOT NULL
  THEN
    RAISE EXCEPTION 'reviewed duplicate index still exists';
  END IF;
END
$$;
