import { useState, useEffect, useRef } from 'react';
import { useEntryStore } from '@/store/entryStore';

/**
 * Identity of an entry's content for change detection. `updatedAt` is bumped by
 * every write that changes an entry (including its competition data), so it is
 * enough on its own; only an entry with no timestamp falls back to serialising
 * `competitionData`.
 */
function entryFingerprint(item: unknown): string {
  const entry = item as { id?: string; updatedAt?: string; competitionData?: unknown };
  const id = entry.id || 'unknown';
  if (entry.updatedAt) return `${id}@${entry.updatedAt}`;
  return `${id}-no-timestamp-${JSON.stringify(entry.competitionData || {})}`;
}

/**
 * Custom hook for safely filtering entries without causing infinite re-renders.
 * This avoids the issues with Zustand selectors in complex UI components.
 *
 * Subscribes to the `entries` slice only, so unrelated entry-store writes
 * (loading flags, errors, subscription handles) do not re-render the caller.
 * `filterFn` is read through a ref: pass everything it closes over in
 * `dependencies`, so an inline arrow does not re-run the filter on every render.
 * The returned array only changes when its content does.
 */
export function useFilteredEntries<T>(
  filterFn: (entries: unknown[]) => T[],
  dependencies: unknown[] = []
) {
  const [filteredData, setFilteredData] = useState<T[]>([]);
  const entries = useEntryStore(state => state.entries);
  const filterFnRef = useRef(filterFn);
  const fingerprintsRef = useRef<string[]>([]);

  useEffect(() => {
    filterFnRef.current = filterFn;
  });

  useEffect(() => {
    const newFilteredData = filterFnRef.current(entries);
    const newFingerprints = newFilteredData.map(entryFingerprint);
    const currentFingerprints = fingerprintsRef.current;

    // Update if the data has actually changed (length, order, or content)
    if (
      newFingerprints.length !== currentFingerprints.length ||
      newFingerprints.some((fingerprint, index) => fingerprint !== currentFingerprints[index])
    ) {
      fingerprintsRef.current = newFingerprints;
      setFilteredData(newFilteredData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, ...dependencies]);

  return filteredData;
}

/**
 * Specialized hook for getting entries by class ID
 */
export function useEntriesByClass(classId: string) {
  return useFilteredEntries(
    entries =>
      classId
        ? entries.filter((entry: unknown) => (entry as { classId?: string }).classId === classId)
        : [],
    [classId]
  );
}

/**
 * Specialized hook for getting entries by show ID
 */
export function useEntriesByShow(showId: string) {
  return useFilteredEntries(
    entries =>
      showId
        ? entries.filter((entry: unknown) => (entry as { showId?: string }).showId === showId)
        : [],
    [showId]
  );
}

/**
 * Specialized hook for getting entries by dog ID
 */
export function useEntriesByDog(dogId: string) {
  return useFilteredEntries(
    entries =>
      dogId
        ? entries.filter((entry: unknown) => (entry as { dogId?: string }).dogId === dogId)
        : [],
    [dogId]
  );
}
