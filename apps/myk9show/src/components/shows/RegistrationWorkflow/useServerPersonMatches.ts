import { useCallback, useEffect, useRef, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { searchUsers } from '@/services/database/users';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';
import type { User as PersonRecord } from '@/types/user-types';
import type { User } from '@/types/dog-types';

/** Plain words shown when the duplicate check had nothing to check against (MYK9-2257). */
export const DUPLICATE_CHECK_UNAVAILABLE = "Can't check for an existing person right now";

export interface ServerMatchResult {
  /** People the server returned for the typed name or email. */
  people: User[];
  /** The server could not be asked (offline or the search failed). */
  failed: boolean;
}

const LOOKUP_DELAY_MS = 400;

function identityTerms(data: Partial<PersonRecord>): string[] {
  const terms = [data.email, data.lastName].map(part => (part ?? '').trim());
  return terms.filter((term, index) => term.length >= 2 && terms.indexOf(term) === index);
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
  const terms = identityTerms(data);
  if (terms.length === 0) return { people: [], failed: false };
  if (!onlineManager.isOnline() || !navigator.onLine) return { people: [], failed: true };
  try {
    const results = await Promise.all(terms.map(term => searchUsers(term)));
    if (results.some(result => result.error)) return { people: [], failed: true };
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
  const [state, setState] = useState<ServerMatchResult & { key: string }>({
    people: [],
    failed: false,
    key: '',
  });
  const seq = useRef(0);
  const key = data ? identityTerms(data).join('|') : '';

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
    setState({ ...result, key: identityTerms(value).join('|') });
    return result;
  }, []);

  const current = state.key === key ? state : { people: [], failed: false };
  return { serverPeople: current.people, serverFailed: current.failed, check };
}
