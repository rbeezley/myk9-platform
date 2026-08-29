import { useShallow } from 'zustand/react/shallow';
import { useTrialStore } from '@/store/trialStore';

export function useShowDeskScheduleRead() {
  const schedule = useTrialStore(
    useShallow(state => ({
      trials: state.trials,
      trialClasses: state.trialClasses,
      trialsReadStatus: state.trialsReadStatus,
      trialsHasConfirmedSnapshot: state.trialsHasConfirmedSnapshot,
      trialClassesReadStatus: state.trialClassesReadStatus,
      trialClassesHasConfirmedSnapshot: state.trialClassesHasConfirmedSnapshot,
      loadTrials: state.loadTrials,
      loadTrialClasses: state.loadTrialClasses,
    }))
  );

  const hasConfirmedSnapshot =
    schedule.trialsHasConfirmedSnapshot && schedule.trialClassesHasConfirmedSnapshot;
  const readFailed =
    schedule.trialsReadStatus === 'error' || schedule.trialClassesReadStatus === 'error';
  const readPending =
    schedule.trialsReadStatus === 'idle' ||
    schedule.trialsReadStatus === 'loading' ||
    schedule.trialClassesReadStatus === 'idle' ||
    schedule.trialClassesReadStatus === 'loading';

  return {
    trials: schedule.trials,
    trialClasses: schedule.trialClasses,
    hasConfirmedSnapshot,
    readFailed,
    readPending,
    retry: () => Promise.all([schedule.loadTrials(), schedule.loadTrialClasses()]),
  };
}
