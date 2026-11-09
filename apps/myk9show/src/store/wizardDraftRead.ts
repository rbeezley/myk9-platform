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
export function isWizardDraftRead(): boolean {
  return useWizardStore.persist.hasHydrated() || useWizardStore.getState().draftReadFailed;
}

function subscribe(onChange: () => void): () => void {
  const stopHydration = useWizardStore.persist.onFinishHydration(onChange);
  const stopStore = useWizardStore.subscribe(onChange);
  return () => {
    stopHydration();
    stopStore();
  };
}

export function useWizardDraftRead(): boolean {
  return useSyncExternalStore(subscribe, isWizardDraftRead);
}
