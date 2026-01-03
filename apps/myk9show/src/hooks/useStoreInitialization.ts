import { useEffect, useRef } from 'react';
import { useEntryStore } from '../store/entryStore';
import { seedEntryStore } from '../utils/storeMigration';

/**
 * Hook to initialize the entry store with sample data if empty
 */
export function useStoreInitialization() {
  const { entries, createMultipleEntries } = useEntryStore();
  const hasInitialized = useRef(false);
  
  useEffect(() => {
    // Force initialization if there are no entries
    if (entries.length === 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      const sampleEntries = seedEntryStore();
      if (sampleEntries.length > 0) {
        createMultipleEntries(sampleEntries);
      }
    }
  }, [entries.length, createMultipleEntries]);
}