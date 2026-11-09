import { useSyncExternalStore } from 'react';
import { useWizardStore } from './wizardStore';

/**
 * Whether the wizard store has finished reading its saved draft from this device: found
 * one, found none, or failed.
 *
 * An Add trials / Add classes visit sets the new-show draft aside as it loads its own
 * (MYK9-1794). Before the read settles there is only the empty pre-load state to set aside,
 * and that would then be written over the saved draft, so the visit waits on this.
 *
 * `hasHydrated()` alone is not enough: it stays false forever when the read fails, which
 * would leave the edit wizard waiting on a draft that will never come. The store records
 * that failure itself (`draftReadFailed`).
 */
type PersistApi = typeof useWizardStore.persist;

/** Absent when no device storage could be opened: zustand then returns the bare store. */
function persistApi(): PersistApi | undefined {
  return (useWizardStore as { persist?: PersistApi }).persist;
}

export function isWizardDraftRead(): boolean {
  const persist = persistApi();
  // With no storage there is nothing to read, so nothing to wait for.
  if (!persist) return true;
  return persist.hasHydrated() || useWizardStore.getState().draftReadFailed;
}

function subscribe(onChange: () => void): () => void {
  const stopHydration = persistApi()?.onFinishHydration(onChange);
  const stopStore = useWizardStore.subscribe(onChange);
  return () => {
    stopHydration?.();
    stopStore();
  };
}

export function useWizardDraftRead(): boolean {
  return useSyncExternalStore(subscribe, isWizardDraftRead);
}
