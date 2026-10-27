interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

const MISSING_SCHEMA_CODES = new Set(['42703', 'PGRST202', 'PGRST204']);
const MISSING_SCHEMA_MESSAGE = /does not exist|schema cache|could not find/i;

const MOVE_UP_LINK_SCHEMA_TARGET = /moved_from_entry_id/i;

const REGISTRATION_CONFIRMATION_NUMBER_SCHEMA_TARGET = /registration_confirmation_number/i;

/**
 * True only when MYK9-659's `registration_confirmation_number` is unavailable
 * on the authenticated entry-results views (20260918193700).
 *
 * The deploy window is real: PostgREST fails the
 * WHOLE request with 42703 on a column it cannot resolve, and `getUserEntries`
 * reads a failed view read as "fall back to the per-show replica" — which on
 * the cross-show `/my-entries` route is empty. Dropping the column instead
 * costs one identifier, not the page.
 *
 * The target is deliberately the VIEW column name, not `confirmation_number`:
 * the embed `registration:registration_id(confirmation_number)` is a different
 * thing on the same select and must not be dropped by this seam.
 */
export function isRegistrationConfirmationNumberSchemaUnavailable(
  error: PostgrestErrorLike | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  if (!REGISTRATION_CONFIRMATION_NUMBER_SCHEMA_TARGET.test(message)) return false;
  return MISSING_SCHEMA_CODES.has(error.code ?? '') || MISSING_SCHEMA_MESSAGE.test(message);
}

/**
 * True only when MYK9-639's `entries.moved_from_entry_id` is unavailable
 * (20260918193300). Vercel builds `main` before anyone runs
 * `supabase db push`, and PostgREST fails the WHOLE request with 42703 on an
 * unknown column — so without this the deploy window turns every entries read
 * into "Couldn't load entries", not just the move-up.
 *
 * The degraded read simply has no supersession link, which the money resolver
 * already treats as "this row is its own root".
 */
export function isMoveUpLinkSchemaUnavailable(
  error: PostgrestErrorLike | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  if (!MOVE_UP_LINK_SCHEMA_TARGET.test(message)) return false;
  return MISSING_SCHEMA_CODES.has(error.code ?? '') || MISSING_SCHEMA_MESSAGE.test(message);
}
