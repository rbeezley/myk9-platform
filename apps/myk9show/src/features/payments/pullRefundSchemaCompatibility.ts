interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

const MISSING_SCHEMA_CODES = new Set(['42703', 'PGRST202', 'PGRST204']);
const MISSING_SCHEMA_MESSAGE = /does not exist|schema cache|could not find/i;

const MOVE_UP_LINK_SCHEMA_TARGET = /moved_from_entry_id/i;

const REGISTRATION_CONFIRMATION_NUMBER_SCHEMA_TARGET = /registration_confirmation_number/i;

const PLACEMENT_TIE_SCHEMA_TARGET = /placement_tie/i;

const RING_PHASE_SCHEMA_TARGET = /ring_phase/i;

/**
 * True only when MYK9-1473's `placement_tie` / `placement_tiebreak` are
 * unavailable on `view_authenticated_entry_results` (20261029043900). Same
 * deploy window as the move-up link: a frontend built before the migration is
 * pushed must not turn the secretary's cold-store entries read into a failure.
 * The degraded read has no tie state, which renders as "no coin flip owed".
 */
export function isPlacementTieSchemaUnavailable(
  error: PostgrestErrorLike | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  if (!PLACEMENT_TIE_SCHEMA_TARGET.test(message)) return false;
  return MISSING_SCHEMA_CODES.has(error.code ?? '') || MISSING_SCHEMA_MESSAGE.test(message);
}

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

/**
 * True only when MYK9-1513's `classes.ring_phase` / `ring_phase_time` are
 * unavailable (20261030174300): 42703 on a read, PGRST204 on a write. Same deploy
 * window as the move-up link, but on the classes replica, so a frontend that ships
 * before `supabase db push` must not take down every signed-in role's class list.
 * The degraded row carries no ring phase, which renders as "no phase set".
 */
export function isRingPhaseSchemaUnavailable(
  error: PostgrestErrorLike | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  if (!RING_PHASE_SCHEMA_TARGET.test(message)) return false;
  return MISSING_SCHEMA_CODES.has(error.code ?? '') || MISSING_SCHEMA_MESSAGE.test(message);
}
