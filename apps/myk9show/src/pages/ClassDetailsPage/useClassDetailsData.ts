/**
 * Data hook for ClassDetailsPage
 *
 * Manages store data, class entries transformation, and parent context.
 *
 * Entries are sourced from two layers and merged:
 *   1. Supabase via React Query (`useClassEntriesWithQuery`) — the primary
 *      source for entries that have been synced to the database.
 *   2. The local Zustand entry store (`useEntryStore`) — captures entries
 *      created offline or via the registration wizard that haven't synced yet.
 *
 * Merging ensures entries are visible immediately after creation (local store)
 * *and* after they've been persisted to the server (React Query).
 */

import { useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { useClassStoreCompat, useClassEntriesWithQuery } from '@/hooks/useClassStoreCompat';
import { useTrialStore } from '@/store/trialStore';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useEntriesByClass } from '@/hooks/useFilteredEntries';
import type { ShowEntry } from '@/types/entry-lifecycle';
import type { CompetitionData } from '@/store/entryStore';
import type { ClassEntryDisplay } from './types';

/**
 * Transform a local ShowEntry (from useEntryStore) into ClassEntryDisplay.
 */
function localEntryToDisplay(
  entry: ShowEntry,
  dogsById: Map<string, { id: string; callName?: string | undefined; name?: string | undefined }>
): ClassEntryDisplay {
  const dog = dogsById.get(entry.dogId);

  const qualificationReason = (
    entry.competitionData as unknown as CompetitionData & { qualificationReason?: string }
  )?.qualificationReason;

  return {
    id: entry.id,
    armband: entry.registrationData?.armband || '',
    handler: entry.registrationData?.handler || '',
    dog: dog?.callName || dog?.name || 'Unknown Dog',
    status: ((entry.competitionData as unknown as CompetitionData & { qualification?: string })
      ?.qualification ||
      (entry.competitionData?.qualified
        ? 'Qualified'
        : 'Not Qualified')) as ClassEntryDisplay['status'],
    ...(qualificationReason !== undefined && { qualificationReason }),
    score: entry.competitionData?.score || '',
    time: entry.competitionData?.time || '',
    placement: entry.competitionData?.placement || '',
    classId: entry.classId,
  };
}

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
  const { dogs } = useDogStoreCompat();
  const dogsById = useMemo(() => new Map(dogs.map(d => [d.id, d])), [dogs]);
  const { trials, trialClasses: replicatedTrialClasses } = useTrialStore();
  const { shows } = useShowStore();

  // Get current class from URL parameter.
  // Fall back to the replication layer (trialStore.trialClasses) when the React
  // Query cache for getAllClasses hasn't loaded yet — classes created by the
  // wizard exist in IndexedDB before they've synced to Supabase.
  const currentClass = useMemo(() => {
    if (!classId) return null;
    const fromQuery = classes.find(cls => cls.id === classId);
    if (fromQuery) return fromQuery;
    // Search replication-layer classes grouped by trial
    for (const trialCls of Object.values(replicatedTrialClasses)) {
      const found = trialCls.find(cls => cls.id === classId);
      if (found) return found as unknown as (typeof classes)[number];
    }
    return null;
  }, [classId, classes, replicatedTrialClasses]);

  // Filter classes to only show classes from the same trial
  const trialClasses = currentClass
    ? classes.filter(cls => cls.trialId === currentClass.trialId)
    : classes;

  // --- Entry sources ---
  // 1. Database entries via React Query (primary source)
  const { entries: dbEntries } = useClassEntriesWithQuery(classId || '', !!classId);

  // 2. Local-only entries from the Zustand entry store (may include entries not yet synced)
  const localEntries = useEntriesByClass(classId || '');

  // Merge: use DB entries as the base, then add any local-only entries that
  // aren't already present (e.g., entries created via the wizard that haven't
  // been uploaded to Supabase yet).
  const rawEntries = localEntries;

  // Get parent trial and show for breadcrumb context
  const parentTrial = trialId
    ? trials.find(trial => trial.id === trialId)
    : currentClass
      ? trials.find(trial => trial.id === currentClass.trialId)
      : undefined;

  const parentShow = showId
    ? shows.find(show => show.id === showId)
    : parentTrial
      ? shows.find(show => show.id === parentTrial.showId)
      : undefined;

  // Transform & merge entries to format expected by ClassDetailsMain.
  // DB entries already have the right shape; local entries need transformation.
  //
  // The local entry store may have fresher data than the DB (e.g., armband
  // assigned via the registration wizard whose UPDATE mutation hasn't synced
  // to Supabase yet). For fields that are empty in the DB version but
  // populated locally, we backfill from the local entry.
  const classEntries = useMemo((): ClassEntryDisplay[] => {
    // Build a lookup of local entries by ID for backfill
    const localById = new Map<string, ShowEntry>();
    for (const entry of localEntries) {
      const typedEntry = entry as ShowEntry;
      localById.set(typedEntry.id, typedEntry);
    }

    // Start with database entries (already in display format)
    const dbDisplayEntries: ClassEntryDisplay[] = dbEntries.map(e => {
      // Backfill armband from local entry if DB version is empty
      let armband = e.armband || '';
      if (!armband) {
        const localEntry = localById.get(e.id);
        armband = localEntry?.registrationData?.armband || '';
      }

      return {
        id: e.id,
        armband,
        handler: e.handler || '',
        dog: e.dog || 'Unknown Dog',
        // Use competitionData qualification if scored, otherwise empty.
        // e.status is the lifecycle status (confirmed/paid/etc.), NOT the scoring result.
        status: ((e as unknown as { competitionData?: { qualification?: string } }).competitionData
          ?.qualification || '') as ClassEntryDisplay['status'],
        score: e.score || '',
        time: e.time || '',
        placement: e.placement || '',
        classId: e.classId || '',
      };
    });

    // Build a set of IDs from the database entries
    const dbIds = new Set(dbDisplayEntries.map(e => e.id));

    // Add local-only entries that aren't in the database yet
    const localOnlyEntries: ClassEntryDisplay[] = [];
    for (const entry of localEntries) {
      const typedEntry = entry as ShowEntry;
      if (!dbIds.has(typedEntry.id)) {
        localOnlyEntries.push(localEntryToDisplay(typedEntry, dogsById));
      }
    }

    const merged = [...dbDisplayEntries, ...localOnlyEntries];

    logger.debug('Class entries merged', 'classes', {
      dbCount: dbDisplayEntries.length,
      localOnlyCount: localOnlyEntries.length,
      totalCount: merged.length,
    });

    return merged;
  }, [dbEntries, localEntries, dogsById]);

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
