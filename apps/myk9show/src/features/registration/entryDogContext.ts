/**
 * Entry dog context — the "I want to enter THIS dog" handoff.
 *
 * Dog Details' "Enter a show" hands a dog id to the ordinary browse →
 * show detail → registration wizard path. The id travels in the URL (not in
 * router state) so a refresh, a copied link and Back/Forward all behave the
 * same way; nothing here selects a dog on its own, it only carries the id and
 * classifies what the wizard should do with it (MYK9-519).
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Dog } from '@/types/dog-types';
import { getDogDisplayName } from '@/types/dog-types';

/** Query-string key carrying the dog the exhibitor started from. */
export const ENTRY_DOG_PARAM = 'dogId';

/**
 * Longest id we will echo back into a URL or a toast. Dog ids are UUIDs; the
 * cap keeps a hand-edited link from turning into an unbounded string.
 */
const MAX_ENTRY_DOG_ID_LENGTH = 64;

/** Read (and sanity-bound) the carried dog id. Returns null when absent. */
export function readEntryDogId(search: URLSearchParams | string): string | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const raw = params.get(ENTRY_DOG_PARAM);
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_ENTRY_DOG_ID_LENGTH) return null;
  return trimmed;
}

/** Append the dog context to a path, preserving any query it already carries. */
export function withEntryDogContext(path: string, dogId: string | null | undefined): string {
  if (!dogId) return path;
  const [base, existing = ''] = path.split('#')[0].split('?');
  const hash = path.includes('#') ? path.slice(path.indexOf('#')) : '';
  const params = new URLSearchParams(existing);
  params.set(ENTRY_DOG_PARAM, dogId);
  return `${base}?${params.toString()}${hash}`;
}

export type EntryDogHandoff =
  /** No dog id in the URL — the ordinary entry path, untouched. */
  | { status: 'none' }
  /** A draft/resume already chose dogs. The draft wins; the param is dropped. */
  | { status: 'draft-wins' }
  | { status: 'applied'; dogIds: string[] }
  /** Missing, deleted, or not this exhibitor's dog. */
  | { status: 'not-found' }
  | { status: 'ineligible'; dogName: string; issues: string[] };

/**
 * Decide what a carried dog id means, given the roster the wizard can actually
 * see and whatever is already in the cart. Pure: the caller applies the result.
 *
 * `accessibleDogs` must already be narrowed to dogs this user may enter, and
 * `eligibility` must be the dog step's own rule — this never writes a second
 * eligibility policy.
 */
export function resolveEntryDogHandoff(input: {
  dogId: string | null;
  accessibleDogs: Dog[];
  selectedDogs: string[];
  eligibility: (dog: Dog) => { eligible: boolean; issues: string[] };
}): EntryDogHandoff {
  const { dogId, accessibleDogs, selectedDogs, eligibility } = input;
  if (!dogId) return { status: 'none' };
  // A resumed draft is a deliberate, saved choice; a URL param is a hint.
  if (selectedDogs.length > 0) return { status: 'draft-wins' };

  const dog = accessibleDogs.find(candidate => candidate.id === dogId);
  if (!dog) return { status: 'not-found' };

  const { eligible, issues } = eligibility(dog);
  if (!eligible) return { status: 'ineligible', dogName: getDogDisplayName(dog), issues };

  return { status: 'applied', dogIds: [dog.id] };
}

/** Exhibitor-facing explanation for a handoff that could not be honored. */
export function entryDogHandoffMessage(handoff: EntryDogHandoff): string | null {
  switch (handoff.status) {
    case 'not-found':
      return "We couldn't find that dog under your account, so nothing was preselected. Choose a dog below.";
    case 'ineligible':
      return `${handoff.dogName} can't be entered in this show (${handoff.issues.join('; ')}). Choose a dog below.`;
    default:
      return null;
  }
}

/** The dog id carried by the CURRENT location, if any. */
export function useEntryDogId(): string | null {
  const [searchParams] = useSearchParams();
  return readEntryDogId(searchParams);
}

/**
 * Build a link that keeps the dog context alive across one browse hop. Used by
 * every surface that navigates to a show's detail page, so the context does not
 * die on whichever view mode the exhibitor happens to be using.
 */
export function useEntryDogLink(): (path: string) => string {
  const dogId = useEntryDogId();
  return useCallback((path: string) => withEntryDogContext(path, dogId), [dogId]);
}
