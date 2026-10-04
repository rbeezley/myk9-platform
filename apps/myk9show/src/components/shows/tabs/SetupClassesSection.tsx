import { useSearchParams } from 'react-router-dom';
import type { Trial } from '@/components/trials/types/trial.types';
import { isScentTrialType } from '@/types/template.types';
import { resolveSelectClassesView } from '@/pages/secretary/selectClassesRoutes';
import { ClassesTab, type ClassInfo } from './ClassesTab';

/**
 * Class Management with its view, trial and focus in the URL. Mounted by
 * Setup → Classes and by the show home's "Select classes" mode (MYK9-956), so
 * the bulk actions, the one-trial-at-a-time rule and per-row judge assignment
 * are the same component in both places.
 */
export function SetupClassesSection({
  showId,
  trials,
  classes,
  userHasEntries,
}: {
  showId: string;
  trials: Trial[];
  classes: ClassInfo[];
  userHasEntries: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // The view and trial live in the URL, so the address bar, back / forward and a shared link
  // always agree with what is on screen.
  const setClassesParam = (key: 'view' | 'trialId', value: string | null) => {
    setSearchParams(
      previous => {
        const params = new URLSearchParams(previous);
        if (value === null || (key === 'view' && value === 'all')) params.delete(key);
        else params.set(key, value);
        // Landing on a deep-linked class is one-shot: moving on drops the focus.
        params.delete('focus');
        return params;
      },
      { replace: true, preventScrollReset: true }
    );
  };

  return (
    <ClassesTab
      classes={classes}
      showId={showId}
      userHasEntries={userHasEntries}
      viewId={resolveSelectClassesView(searchParams.get('view'))}
      onViewChange={view => setClassesParam('view', view)}
      trials={trials}
      trialId={searchParams.get('trialId')}
      onTrialChange={trial => setClassesParam('trialId', trial)}
      focusClassId={searchParams.get('focus')}
      hideRing={trials.some(trial => isScentTrialType(trial.trialType))}
    />
  );
}
