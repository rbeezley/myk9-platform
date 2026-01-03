import { useState, useEffect } from 'react';
import { useEntryStore } from '@/store/entryStore';

/**
 * Custom hook for safely filtering entries without causing infinite re-renders.
 * This avoids the issues with Zustand selectors in complex UI components.
 */
export function useFilteredEntries<T>(
  filterFn: (entries: unknown[]) => T[],
  dependencies: unknown[] = []
) {
  const [filteredData, setFilteredData] = useState<T[]>([]);
  const entryStore = useEntryStore();
  
  useEffect(() => {
    // Apply the filter function
    const newFilteredData = filterFn(entryStore.entries);
    
    // Create a comparison array that includes updatedAt timestamps to detect content changes
    const newFingerprints = newFilteredData.map((item: unknown) => {
      const entry = item as { id?: string; updatedAt?: string; competitionData?: unknown };
      return `${entry.id || 'unknown'}-${entry.updatedAt || 'no-timestamp'}-${JSON.stringify(entry.competitionData || {})}`;
    });
    const currentFingerprints = filteredData.map((item: unknown) => {
      const entry = item as { id?: string; updatedAt?: string; competitionData?: unknown };
      return `${entry.id || 'unknown'}-${entry.updatedAt || 'no-timestamp'}-${JSON.stringify(entry.competitionData || {})}`;
    });
    
    console.log('🔍 useFilteredEntries check:');
    console.log('  New fingerprints:', newFingerprints);
    console.log('  Current fingerprints:', currentFingerprints);
    
    // Update if the data has actually changed (length, order, or content)
    if (newFingerprints.length !== currentFingerprints.length || 
        newFingerprints.some((fingerprint, index) => fingerprint !== currentFingerprints[index])) {
      console.log('✅ Fingerprints changed, updating filtered data');
      setFilteredData(newFilteredData);
    } else {
      console.log('❌ Fingerprints unchanged, keeping current data');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryStore.entries, filterFn, ...dependencies]);
  
  return filteredData;
}

/**
 * Specialized hook for getting entries by class ID
 */
export function useEntriesByClass(classId: string) {
  return useFilteredEntries(
    (entries) => classId ? entries.filter((entry: unknown) => (entry as { classId?: string }).classId === classId) : [],
    [classId]
  );
}

/**
 * Specialized hook for getting entries by show ID
 */
export function useEntriesByShow(showId: string) {
  return useFilteredEntries(
    (entries) => showId ? entries.filter((entry: unknown) => (entry as { showId?: string }).showId === showId) : [],
    [showId]
  );
}

/**
 * Specialized hook for getting entries by dog ID
 */
export function useEntriesByDog(dogId: string) {
  return useFilteredEntries(
    (entries) => dogId ? entries.filter((entry: unknown) => (entry as { dogId?: string }).dogId === dogId) : [],
    [dogId]
  );
}