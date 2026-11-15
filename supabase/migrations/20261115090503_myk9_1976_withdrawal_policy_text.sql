-- =============================================================================
-- MYK9-1976: the club's own refund and withdrawal policy text
-- =============================================================================
-- Owner decision (2026-11-14): the club enters or edits the words exhibitors read about
-- refunds and withdrawals; the app provides a default.
--
--   clubs.default_withdrawal_policy_text  the club's text for every show it hosts
--   shows.withdrawal_policy_text          one show's own text, overriding the club's
--
-- NULL in either column means "use what comes next": a show's text, else the club's
-- text, else the default the app builds from the structured policy fields and the
-- show's registry (apps/myk9show/src/features/payments/withdrawalPolicyText.ts).
-- Words only: no server logic reads these columns, and the refund the app suggests is
-- still computed from the cutoff and amount-kept columns, never from this text.
--
-- Length: 1 to 1166 characters after trimming: Stripe's 1200-character cap on a payment
-- page's custom_text, less the service-fee sentence and the blank line the disclosure
-- always adds after the text, so a saved text never has to be cut there. A blank string is
-- refused; the app saves NULL instead.
--
-- GRANTS (from the applied database, pg_class.relacl and pg_attribute.attacl, 2026-11-15):
--   clubs: authenticated=arwd, anon=r, service_role=all; no column ACLs.
--   shows: authenticated=arw,  anon=r, service_role=all; no column ACLs.
-- The new columns inherit those table-level grants, exactly like the existing
-- default_withdrawal_* and withdrawal_* policy columns (20260625200000), so they are
-- readable and writable by the same roles. Writes stay gated by the existing
-- clubs_update / shows_update RLS (club and show managers). No GRANT or REVOKE is added;
-- splitting either table into a column allowlist would break every select('*') on it.
-- Both columns are written online only, through PostgREST from the policy card, like
-- the other policy columns; neither is in an offline mutation path.
-- =============================================================================

BEGIN;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS default_withdrawal_policy_text text;

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS withdrawal_policy_text text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clubs_default_withdrawal_policy_text_check'
      AND conrelid = 'public.clubs'::regclass
  ) THEN
    ALTER TABLE public.clubs
      ADD CONSTRAINT clubs_default_withdrawal_policy_text_check
      CHECK (
        default_withdrawal_policy_text IS NULL
        OR pg_catalog.char_length(pg_catalog.btrim(default_withdrawal_policy_text)) BETWEEN 1 AND 1166
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shows_withdrawal_policy_text_check'
      AND conrelid = 'public.shows'::regclass
  ) THEN
    ALTER TABLE public.shows
      ADD CONSTRAINT shows_withdrawal_policy_text_check
      CHECK (
        withdrawal_policy_text IS NULL
        OR pg_catalog.char_length(pg_catalog.btrim(withdrawal_policy_text)) BETWEEN 1 AND 1166
      );
  END IF;
END $$;

COMMENT ON COLUMN public.clubs.default_withdrawal_policy_text IS
  'MYK9-1976: the club''s refund and withdrawal policy text, shown to exhibitors on every show that sets none of its own. Plain text, 1 to 1166 characters. NULL = the app''s default, built from the structured policy fields and the show''s registry. Words only: never read to compute a refund.';
COMMENT ON COLUMN public.shows.withdrawal_policy_text IS
  'MYK9-1976: this show''s own refund and withdrawal policy text, overriding clubs.default_withdrawal_policy_text. Plain text, 1 to 1166 characters. NULL = the club''s text, else the app''s default. Words only: never read to compute a refund.';

COMMIT;
