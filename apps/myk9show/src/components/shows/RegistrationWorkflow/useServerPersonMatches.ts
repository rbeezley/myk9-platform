import { useCallback, useEffect, useRef, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { searchUsers } from '@/services/database/users';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';
import type { User as PersonRecord } from '@/types/user-types';
import type { User } from '@/types/dog-types';

/** Plain words shown when the duplicate check had nothing to check against (MYK9-2257). */
export const DUPLICATE_CHECK_UNAVAILABLE = "Can't check for an existing person right now";

/** Shown when offline and the check ran over the saved people directory only (MYK9-2265). */
export const DUPLICATE_CHECK_SAVED_ONLY = 'Checked the people saved on this device.';

export interface ServerMatchResult {
  /** People the server returned for the typed name or email. */
  people: User[];
  /** The server could not be asked (offline or the search failed). */
  failed: boolean;
}

const LOOKUP_DELAY_MS = 400;
/** Venue wifi can report online and still stall: past this the lookup counts as failed. */
export const LOOKUP_DEADLINE_MS = 4000;
const EMPTY_STATE = { people: [], failed: false, key: '' };

function identityTerms(data: Partial<PersonRecord>): string[] {
  const terms = [data.email, data.lastName].map(part => (part ?? '').trim());
  return terms.filter((term, index) => term.length >= 2 && terms.indexOf(term) === index);
}

/** The key a lookup answer is stored under: the email and last name that were searched. */
export function serverMatchKey(data: Partial<PersonRecord>): string {
  return identityTerms(data).join('|');
}

/**
 * Asks the server for people matching the typed email and last name, so the
 * duplicate check still works on a device whose saved people directory is empty
 * (MYK9-2257). Offline, or when the search fails, `failed` is true and the form
 * says it could not check; adding the person is never blocked.
 */
export async function fetchServerPersonMatches(
  data: Partial<PersonRecord>
): Promise<ServerMatchResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<ServerMatchResult>(resolve => {
    timer = setTimeout(() => resolve({ people: [], failed: true }), LOOKUP_DEADLINE_MS);
  });
  try {
    return await Promise.race([lookupServerPeople(data), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function lookupServerPeople(data: Partial<PersonRecord>): Promise<ServerMatchResult> {
  const terms = identityTerms(data);
  if (terms.length === 0) return { people: [], failed: false };
  if (!onlineManager.isOnline() || !navigator.onLine) return { people: [], failed: true };
  try {
    const settled = await Promise.allSettled(terms.map(term => searchUsers(term)));
    const results = settled.flatMap(item =>
      item.status === 'fulfilled' && !item.value.error ? [item.value] : []
    );
    // Rows from a term that answered still count; failed only when none did.
    if (results.length === 0) return { people: [], failed: true };
    const byId = new Map<string, User>();
    for (const result of results) {
      for (const row of result.data) {
        const person = mapDatabaseToUser(row as Record<string, unknown>);
        byId.set(person.id, person);
      }
    }
    return { people: [...byId.values()], failed: false };
  } catch {
    return { people: [], failed: true };
  }
}

/**
 * Keeps the latest server matches for the identity being typed (debounced), for
 * the synchronous Next check. The save re-asks through `check`, which waits for
 * the answer.
 */
export function useServerPersonMatches(open: boolean, data: Partial<PersonRecord> | null) {
  const [state, setState] = useState<ServerMatchResult & { key: string }>(EMPTY_STATE);
  // A closed form forgets its answer, so a reopened one never shows a stale notice.
  const seq = useRef(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      seq.current += 1;
      setState(EMPTY_STATE);
    }
  }
  const key = data ? serverMatchKey(data) : '';

  useEffect(() => {
    if (!open || !data || key === '') return;
    const run = ++seq.current;
    const timer = setTimeout(() => {
      void fetchServerPersonMatches(data).then(result => {
        if (seq.current === run) setState({ ...result, key });
      });
    }, LOOKUP_DELAY_MS);
    return () => clearTimeout(timer);
    // `data` is covered by `key`, which is built from exactly the fields searched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const check = useCallback(async (value: Partial<PersonRecord>) => {
    seq.current += 1;
    const result = await fetchServerPersonMatches(value);
    setState({ ...result, key: serverMatchKey(value) });
    return result;
  }, []);

  const current = state.key === key ? state : { people: [], failed: false };
  // The last answer the hook settled on, whatever identity it was for: the save reuses
  // it when `key` matches the person being saved, so it never waits on the lookup twice.
  const settled = state.key === '' ? null : state;
  return { serverPeople: current.people, serverFailed: current.failed, check, settled };
}
