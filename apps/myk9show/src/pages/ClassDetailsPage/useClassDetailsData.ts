/**
 * Data hook for ClassDetailsPage
 *
 * Manages store data, class entries transformation, and parent context
 */

import { useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTrialStore } from '@/store/trialStore';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useDogStore } from '@/store/dogStore';
import { useEntriesByClass } from '@/hooks/useFilteredEntries';
import type { ShowEntry } from '@/types/entry-lifecycle';
import type { CompetitionData } from '@/store/entryStore';
import type { ClassEntryDisplay } from './types';

export function useClassDetailsData() {
  const { classId, showId, trialId } = useParams<{
    classId: string;
    showId?: string;
    trialId?: string;
  }>();
  const location = useLocation();

  // Detect if we're in "results view mode" based on URL path
  const isResultsView = location.pathname.endsWith('/results');

  // Store hooks
  const { classes, updateClass, deleteClass } = useClassStoreCompat();
  const { updateResult } = useEntryStore();
  const { dogs } = useDogStore();
  const { trials } = useTrialStore();
  const { shows } = useShowStore();

  // Get current class from URL parameter
  const currentClass = classId ? classes.find((cls) => cls.id === classId) : null;

  // Filter classes to only show classes from the same trial
  const trialClasses = currentClass
    ? classes.filter((cls) => cls.trialId === currentClass.trialId)
    : classes;

  // Get entries for current class
  const rawEntries = useEntriesByClass(classId || '');

  // Get parent trial and show for breadcrumb context
  const parentTrial = trialId
    ? trials.find((trial) => trial.id === trialId)
    : currentClass
      ? trials.find((trial) => trial.id === currentClass.trialId)
      : undefined;

  const parentShow = showId
    ? shows.find((show) => show.id === showId)
    : parentTrial
      ? shows.find((show) => show.id === parentTrial.showId)
      : undefined;

  // Transform entries to format expected by ClassDetailsMain
  const classEntries = useMemo((): ClassEntryDisplay[] => {
    return rawEntries.map((entry) => {
      const typedEntry = entry as ShowEntry;
      const dog = dogs.find((d) => d.id === typedEntry.dogId);

      logger.debug('Transform entry', 'classes', {
        id: typedEntry.id,
        dogName: dog?.callName || dog?.name,
        competitionData: typedEntry.competitionData,
        qualification: (
          typedEntry.competitionData as unknown as CompetitionData & { qualification?: string }
        )?.qualification,
        qualified: typedEntry.competitionData?.qualified,
      });

      const qualificationReason = (
        typedEntry.competitionData as unknown as CompetitionData & { qualificationReason?: string }
      )?.qualificationReason;

      return {
        id: typedEntry.id,
        armband: typedEntry.registrationData?.armband || '',
        handler: typedEntry.registrationData?.handler || '',
        dog: dog?.callName || dog?.name || 'Unknown Dog',
        status: ((
          typedEntry.competitionData as unknown as CompetitionData & { qualification?: string }
        )?.qualification ||
          (typedEntry.competitionData?.qualified ? 'Qualified' : 'Not Qualified')) as ClassEntryDisplay['status'],
        ...(qualificationReason !== undefined && { qualificationReason }),
        score: typedEntry.competitionData?.score || '',
        time: typedEntry.competitionData?.time || '',
        placement: typedEntry.competitionData?.placement || '',
        classId: typedEntry.classId,
      };
    });
  }, [rawEntries, dogs]);

  return {
    // URL params
    classId,
    showId,
    trialId,
    isResultsView,

    // Class data
    classes,
    currentClass,
    trialClasses,

    // Entries
    rawEntries,
    classEntries,

    // Parent context
    parentTrial,
    parentShow,

    // Dogs for entry lookups
    dogs,

    // Actions
    updateClass,
    deleteClass,
    updateResult,
  };
}
