import { useState, useEffect } from 'react';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';

export interface ScoringBreadcrumbData {
  showId: string | undefined;
  showName: string | undefined;
  trialId: string | undefined;
  trialLabel: string | undefined;
  classId: string;
  className: string | undefined;
  isLoading: boolean;
}

/**
 * Fetches the show → trial → class hierarchy for breadcrumb navigation
 * on scoring pages. Uses replicated tables for offline-first access.
 */
export function useScoringBreadcrumb(classId: string | undefined): ScoringBreadcrumbData {
  const [data, setData] = useState<ScoringBreadcrumbData>({
    showId: undefined,
    showName: undefined,
    trialId: undefined,
    trialLabel: undefined,
    classId: classId || '',
    className: undefined,
    isLoading: true,
  });

  useEffect(() => {
    async function loadHierarchy() {
      if (!classId) return;

      try {
        const cls = await replicatedClassesTable.getClassById(classId);
        if (!cls) {
          setData({
            showId: undefined,
            showName: undefined,
            trialId: undefined,
            trialLabel: undefined,
            classId,
            className: undefined,
            isLoading: false,
          });
          return;
        }

        const trialId = cls.trialId || cls.trial_id;
        const trial = trialId ? await replicatedTrialsTable.getTrialById(trialId) : null;
        const showId = trial?.showId;
        const show = showId ? await replicatedShowsTable.get(showId) : null;

        const trialLabel = trial
          ? trial.trialNumber
            ? `Trial ${trial.trialNumber}`
            : trial.name
          : undefined;

        setData({
          showId: showId || undefined,
          showName: show?.name,
          trialId: trialId || undefined,
          trialLabel,
          classId,
          className: cls.name,
          isLoading: false,
        });
      } catch {
        setData({
          showId: undefined,
          showName: undefined,
          trialId: undefined,
          trialLabel: undefined,
          classId,
          className: undefined,
          isLoading: false,
        });
      }
    }

    loadHierarchy();
  }, [classId]);

  return data;
}
