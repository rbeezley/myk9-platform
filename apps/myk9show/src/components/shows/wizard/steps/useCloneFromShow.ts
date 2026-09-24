import { useCallback } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import { useUserStore } from '@/store/userStore';
import { useTemplates } from '@/hooks/useTemplates';
import type { Show, ShowTrial } from '@/types/show-types';
import { buildCloneSnapshot, getCloneSourceTrials } from './cloneFromShow';

/**
 * Start (or retry) cloning a past show into the wizard. Loads every source class first, then
 * applies one atomic snapshot; a load failure leaves the draft untouched and the clone
 * `failed`. A superseded or cancelled load is discarded by the store's generation check.
 */
export function useCloneFromShow(): (show: Show) => Promise<void> {
  const { beginCloneHydration, failCloneHydration, completeCloneHydration } = useWizardStore();
  const { people } = useUserStore();
  const { templates } = useTemplates();

  return useCallback(
    async (show: Show) => {
      const generation = beginCloneHydration(show.id, show.name);
      let sourceTrials: ShowTrial[];
      try {
        sourceTrials = await getCloneSourceTrials(show);
      } catch {
        failCloneHydration(generation);
        return;
      }
      completeCloneHydration(
        generation,
        buildCloneSnapshot({ show, sourceTrials, people, templates })
      );
    },
    [beginCloneHydration, failCloneHydration, completeCloneHydration, people, templates]
  );
}
