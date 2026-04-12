import { useEntryStore } from '@/store/entryStore';
import { useTrialStore } from '@/store/trialStore';

export interface QuickActionStats {
  pendingEntriesCount: number;
  reportsReadyCount: number;
  activeTrialsCount: number;
}

/**
 * Derives three show-scoped counts for the Mission Control quick-action cards.
 * Reads synchronously from entryStore and trialStore — no network calls.
 * Returns all zeros when showId is empty.
 */
export function useQuickActionStats(showId: string): QuickActionStats {
  const pendingEntriesCount = useEntryStore(s => {
    if (!showId) return 0;
    return s.entries.filter(e => e.showId === showId && e.status === 'submitted').length;
  });

  const reportsReadyCount = useTrialStore(s => {
    if (!showId) return 0;
    const showTrialIds = s.trials.filter(t => t.showId === showId).map(t => t.id);
    return showTrialIds.reduce((count, trialId) => {
      const classes = s.trialClasses[trialId] ?? [];
      return count + classes.filter(c => c.isScoringFinalized === true).length;
    }, 0);
  });

  const activeTrialsCount = useTrialStore(s => {
    if (!showId) return 0;
    return s.trials.filter(
      t => t.showId === showId && t.status !== 'completed' && t.status !== 'cancelled'
    ).length;
  });

  return { pendingEntriesCount, reportsReadyCount, activeTrialsCount };
}
