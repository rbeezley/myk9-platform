import { useMemo } from 'react';
import type { OwnableDog } from '@/utils/dogOwnership';
import { selectOwnedDogIds } from '@/utils/dogOwnership';
import {
  buildSubmittedEntryProjection,
  toSubmittedEntryProjectionRow,
  type SubmittedEntryDbRow,
  type SubmittedEntryProjection,
  type SubmittedEntryReadState,
} from './submittedEntryProjection';

function getEntryDogOwnerId(entry: unknown): string | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  const dog = (entry as { dog?: unknown }).dog;
  if (!dog || typeof dog !== 'object') return undefined;
  const owner = (dog as { owner?: unknown }).owner;
  if (!owner || typeof owner !== 'object') return undefined;
  const ownerId = (owner as { id?: unknown }).id;
  return typeof ownerId === 'string' ? ownerId : undefined;
}

export interface UseSubmittedEntryProjectionResult {
  projection: SubmittedEntryProjection;
  ownedEntryRows: SubmittedEntryDbRow[];
  state: SubmittedEntryReadState;
}

export function useSubmittedEntryProjection({
  entries,
  dogs,
  databaseUserId,
  isLoading,
  isError,
}: {
  entries: readonly unknown[];
  dogs: readonly OwnableDog[];
  databaseUserId: string | null | undefined;
  isLoading: boolean;
  isError: boolean;
}): UseSubmittedEntryProjectionResult {
  const state: SubmittedEntryReadState = isError ? 'error' : isLoading ? 'loading' : 'ready';

  return useMemo(() => {
    const dbRows = entries.map(entry => entry as SubmittedEntryDbRow);
    const ownedDogIds = selectOwnedDogIds(dogs, databaseUserId);
    if (databaseUserId) {
      for (const entry of dbRows) {
        if (getEntryDogOwnerId(entry) !== databaseUserId) continue;
        const dogId = typeof entry.dog_id === 'string' ? entry.dog_id : undefined;
        if (dogId) ownedDogIds.add(dogId);
      }
    }

    const projectionRows = dbRows.flatMap(entry => {
      const row = toSubmittedEntryProjectionRow(entry);
      return row ? [row] : [];
    });
    const projection = buildSubmittedEntryProjection({
      rows: projectionRows,
      ownedDogIds,
      state,
    });
    const visibleEntryIds = new Set(projection.ownedHistory.map(entry => entry.id));
    const ownedEntryRows = dbRows.filter(entry => visibleEntryIds.has(String(entry.id)));

    return { projection, ownedEntryRows, state };
  }, [entries, dogs, databaseUserId, state]);
}
