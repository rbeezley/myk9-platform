/**
 * The one set of words that NAME a check-in state, read by My Shows, "Your
 * dogs today" and the Ringside entry list (MYK9-2093), so the same state never
 * reads three ways. Words are stored as inline prose (lowercase); a surface
 * that stands the word alone uses `checkInStateLabel`.
 *
 * This names states only. Buttons and choices the exhibitor taps ("Check in",
 * the check-in dialog's "I am here") are actions and live with their screens.
 *
 * INTENT: `pulled` is the day-of check-in state and says WHEN, "pulled at the
 * show", because a stored scratch also reads "pulled" and the two descriptors
 * are otherwise identical (MYK9-632, docs/INTENT.md "Say Which Act Happened").
 */

export const CHECK_IN_STATE_WORDS = {
  'no-status': 'not checked in',
  'checked-in': 'checked in',
  'at-gate': 'at gate',
  'come-to-gate': 'come to gate',
  'in-ring': 'in the ring',
  conflict: 'conflict',
  pulled: 'pulled at the show',
} as const;

export type CheckInStateWordKey = keyof typeof CHECK_IN_STATE_WORDS;

/** The inline word for a check-in state, or `undefined` when it has none here (including no state at all; pass `'no-status'` explicitly for the default). */
export function checkInStateWord(state: string | null | undefined): string | undefined {
  if (state == null) return undefined;
  return (CHECK_IN_STATE_WORDS as Record<string, string | undefined>)[state];
}

/** The same word with a capital first letter, for a badge that stands alone. */
export function checkInStateLabel(state: string | null | undefined): string | undefined {
  const word = checkInStateWord(state);
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : undefined;
}
