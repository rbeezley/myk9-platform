-- MYK9-1010: give the three shared E2E/demo fixture owners a complete address
-- BEFORE `supabase db push` of 20261008183700_myk9_1010_owner_address_required.sql.
-- One-shot LIVE data update; NOT a migration.
--
-- Why: after that migration, submit_show_entries (and stripe-checkout) refuse an
-- AKC entry whose dog's owner has no complete address. These accounts own live
-- dogs that E2E specs enter into the AKC demo show (Heartland Scent Work
-- Classic), and on 2026-10-08 their addresses were incomplete:
--   exhibitor@myk9t.com (Casey Morgan)  -- no street address
--   secretary@myk9t.com (Jordan Ellis)  -- no address at all
--   testadmin@myk9t.com (Taylor Brooks) -- no address at all
-- Real people's rows (e.g. tadams@cox.net) are deliberately NOT touched.
--
-- Values are obviously fake and match apps/myk9show/scripts/demoAccountNames.ts
-- (DEMO_ACCOUNT_ADDRESSES); demoAccountAddressesContract.test.ts pins them.
--
-- Idempotent: fills only BLANK parts (NULL or whitespace) and touches only rows
-- with a blank part, so a second run updates 0 rows and keeps any address
-- someone typed. Exactly these three emails.
--
-- Apply with owner approval, as postgres, from a worktree with supabase/.env:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/myk9-1010-fixture-addresses.sql
-- The verify query at the end must return 0 rows; if it does not, the DO block
-- raises first and the transaction rolls back.

BEGIN;

CREATE TEMP TABLE fixture_address (
  email text PRIMARY KEY,
  street_address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO fixture_address VALUES
  ('exhibitor@myk9t.com', '101 Demo Lane', 'Demoville', 'KS', '99999'),
  ('secretary@myk9t.com', '102 Demo Lane', 'Demoville', 'KS', '99999'),
  ('testadmin@myk9t.com', '104 Demo Lane', 'Demoville', 'KS', '99999');

-- Show what changes (first run: up to 3 rows; re-run: 0).
WITH upd AS (
  UPDATE public.people AS p
  SET street_address = COALESCE(NULLIF(btrim(p.street_address), ''), f.street_address),
      city = COALESCE(NULLIF(btrim(p.city), ''), f.city),
      state = COALESCE(NULLIF(btrim(p.state), ''), f.state),
      zip_code = COALESCE(NULLIF(btrim(p.zip_code), ''), f.zip_code)
  FROM fixture_address AS f
  WHERE lower(p.email) = f.email
    AND p.deleted_at IS NULL
    AND (NULLIF(btrim(p.street_address), '') IS NULL
         OR NULLIF(btrim(p.city), '') IS NULL
         OR NULLIF(btrim(p.state), '') IS NULL
         OR NULLIF(btrim(p.zip_code), '') IS NULL)
  RETURNING p.id, p.email, p.street_address, p.city, p.state, p.zip_code
)
SELECT * FROM upd ORDER BY email;

-- Fail closed: every live fixture person must now be complete, and each email
-- must match exactly one live person (a duplicate or a missing row is a surprise
-- to look at, not to paper over).
DO $$
DECLARE
  v_incomplete integer;
  v_matched integer;
BEGIN
  SELECT count(*) INTO v_matched
  FROM public.people p
  JOIN fixture_address f ON lower(p.email) = f.email
  WHERE p.deleted_at IS NULL;
  IF v_matched <> 3 THEN
    RAISE EXCEPTION 'MYK9-1010 fixture addresses: expected 3 live fixture people, found %', v_matched;
  END IF;

  SELECT count(*) INTO v_incomplete
  FROM public.people p
  JOIN fixture_address f ON lower(p.email) = f.email
  WHERE p.deleted_at IS NULL
    AND (NULLIF(btrim(p.street_address), '') IS NULL
         OR NULLIF(btrim(p.city), '') IS NULL
         OR NULLIF(btrim(p.state), '') IS NULL
         OR NULLIF(btrim(p.zip_code), '') IS NULL);
  IF v_incomplete <> 0 THEN
    RAISE EXCEPTION 'MYK9-1010 fixture addresses: % fixture people still incomplete', v_incomplete;
  END IF;
END $$;

-- Verify: must return 0 rows.
SELECT p.id, p.email, p.street_address, p.city, p.state, p.zip_code
FROM public.people p
JOIN fixture_address f ON lower(p.email) = f.email
WHERE p.deleted_at IS NULL
  AND (NULLIF(btrim(p.street_address), '') IS NULL
       OR NULLIF(btrim(p.city), '') IS NULL
       OR NULLIF(btrim(p.state), '') IS NULL
       OR NULLIF(btrim(p.zip_code), '') IS NULL);

COMMIT;
