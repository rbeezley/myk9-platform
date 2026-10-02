import type { ClassEntryDisplay, ShowEntry } from './types';

export interface EntryToRemove {
  id: string;
  /** Dog call name (or name) for the dialog title; falls back to 'this dog'. */
  dogName: string;
  handlerName: string | undefined;
}

interface RawRowLike {
  id: string;
  dog_id?: string | null | undefined;
  handler?: string | null | undefined;
  dog?: { name?: string | null; call_name?: string | null } | null | undefined;
}

interface DogLike {
  id: string;
  name?: string | null | undefined;
  callName?: string | null | undefined;
}

/**
 * Finds the entry a row's remove click named, in the same sources the page
 * renders rows from: the device entry store, the query rows (staff or public),
 * and the merged display list. Searching only the device store made the dialog
 * never open for a viewer whose rows come from the query alone (a club admin).
 */
export function resolveEntryToRemove(
  entryId: string | null | undefined,
  sources: {
    localRawEntries: readonly unknown[];
    dbRawEntries: readonly RawRowLike[];
    classEntries: readonly ClassEntryDisplay[];
    dogs: readonly DogLike[];
  }
): EntryToRemove | undefined {
  if (!entryId) return undefined;
  const dogName = (dogId: string | null | undefined, fallback?: string) => {
    const dog = dogId ? sources.dogs.find(d => d.id === dogId) : undefined;
    return dog?.callName || dog?.name || fallback || 'this dog';
  };

  const local = sources.localRawEntries.find(e => (e as ShowEntry).id === entryId) as
    ShowEntry | undefined;
  if (local) {
    return {
      id: local.id,
      dogName: dogName(local.dogId),
      handlerName: local.registrationData?.handler,
    };
  }

  const raw = sources.dbRawEntries.find(e => e.id === entryId);
  if (raw) {
    return {
      id: raw.id,
      dogName: dogName(raw.dog_id, raw.dog?.call_name || raw.dog?.name || undefined),
      handlerName: raw.handler || undefined,
    };
  }

  const display = sources.classEntries.find(e => e.id === entryId);
  if (display) {
    return {
      id: display.id,
      dogName: display.dog || 'this dog',
      handlerName: display.handler || undefined,
    };
  }
  return undefined;
}
