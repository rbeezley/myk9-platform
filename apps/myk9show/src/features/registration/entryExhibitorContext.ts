/**
 * Entry exhibitor context: "add another entry for THIS exhibitor" (MYK9-1594).
 *
 * An entry form's menu hands the secretary wizard a person id (`exhibitor`) and the form it came
 * from (`returnForm`, the form's `registration` key on Entry Forms). The wizard has no exhibitor
 * state of its own (the exhibitor is whoever owns the dogs picked), so the id only decides which
 * dogs the dog step offers first; the entries land on that person's one enrollment for the show
 * and the receipt returns to the same form. Both travel in the URL, like `dogId`, so a refresh or
 * a copied link repeats the handoff.
 */

import { useSearchParams } from 'react-router-dom';

export const ENTRY_EXHIBITOR_PARAM = 'exhibitor';
export const ENTRY_RETURN_FORM_PARAM = 'returnForm';

/** Ids are UUIDs and form keys are `<uuid>`, `pi:<intent>` or `entry:<uuid>`; the cap keeps a hand-edited link bounded. */
const MAX_PARAM_LENGTH = 128;

function readBounded(search: URLSearchParams | string, key: string): string | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const trimmed = params.get(key)?.trim();
  return trimmed && trimmed.length <= MAX_PARAM_LENGTH ? trimmed : null;
}

/** The exhibitor (person id) the wizard was opened for, or null. */
export function readEntryExhibitorId(search: URLSearchParams | string): string | null {
  return readBounded(search, ENTRY_EXHIBITOR_PARAM);
}

/** The Entry Forms form to return to after the entries are submitted, or null. */
export function readEntryReturnFormKey(search: URLSearchParams | string): string | null {
  return readBounded(search, ENTRY_RETURN_FORM_PARAM);
}

export function useEntryExhibitorId(): string | null {
  const [searchParams] = useSearchParams();
  return readEntryExhibitorId(searchParams);
}

/**
 * The form to return to after submit. The entries land on the enrollment of whoever owns the dogs
 * picked, so when the secretary searched past the named exhibitor and picked someone else's dog
 * the original form does not hold them: return to the plain list instead of a stale form.
 */
export function resolveReturnFormKey(input: {
  returnFormKey: string | null;
  exhibitorId: string | null;
  /** The owner of the dogs picked, when the cart resolves to exactly one. */
  ownerId: string | undefined;
}): string | null {
  const { returnFormKey, exhibitorId, ownerId } = input;
  if (!returnFormKey) return null;
  return !exhibitorId || exhibitorId === ownerId ? returnFormKey : null;
}
