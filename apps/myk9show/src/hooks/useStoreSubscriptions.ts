import { useEffect, useRef } from 'react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import { useEntryStore } from '@/store/entryStore';
import { useClubStore } from '@/store/clubStore';

/**
 * Subscribes all replicated Zustand stores to their IndexedDB tables.
 * When ReplicationSyncProvider downloads data, the subscription callbacks
 * fire and Zustand stores update, triggering React re-renders.
 *
 * Must be called once near the top of the component tree (inside
 * ReplicationSyncProvider) so subscriptions are active before any
 * page-level component reads store data.
 */
export function useStoreSubscriptions() {
  const initialized = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-invocation
    if (initialized.current) return;
    initialized.current = true;

    useShowStore.getState().initializeSubscription();
    useTrialStore.getState().initializeSubscription();
    useClassStore.getState().initializeSubscription();
    useEntryStore.getState().initializeSubscription();
    useClubStore.getState().initializeSubscription();

    return () => {
      initialized.current = false;
      useShowStore.getState().cleanup();
      useTrialStore.getState().cleanup();
      useClassStore.getState().cleanup();
      useEntryStore.getState().cleanup();
      useClubStore.getState().cleanup();
    };
  }, []);
}
