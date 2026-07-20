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
import { useClassEntriesRaw, type RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { usePublicClassById } from '@/hooks/queries/usePublicClassById';
import { useTrialStore } from '@/store/trialStore';
import { useShowStore } from '@/store/showStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useEntriesByClass } from '@/hooks/useFilteredEntries';
import type { ShowEntry } from '@/types/entry-lifecycle';
import type { CompetitionData } from '@/store/entryStore';
import type { ClassEntryDisplay } from './types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import type { SecretaryEntry } from '@/services/database/entries';

function secretaryEntryToRawRow(entry: SecretaryEntry): RawEntryRow {
  return {
    id: entry.id,
    class_id: entry.class_id ?? '',
    show_id: entry.show_id ?? '',
    dog_id: entry.dog_id ?? '',
    registration_id: entry.registration_id,
    entry_status: entry.entry_status,
    payment_status: entry.payment_status,
    registration: entry.registration,
    handler_id: entry.handler_id,
    armband: entry.armband,
    handler: entry.handler,
    result_status: entry.result_status,
    is_scored: entry.is_scored,
    search_time_seconds: entry.search_time_seconds,
    total_faults: entry.total_faults,
    final_placement: entry.final_placement,
    judge_notes: entry.judge_notes,
    disqualification_reason: entry.disqualification_reason,
    scoring_completed_at: entry.scoring_completed_at,
    check_in_status: entry.check_in_status,
    run_order: entry.run_order,
    dog: entry.dog
      ? {
          id: entry.dog.id,
          name: entry.dog.name,
          call_name: entry.dog.call_name,
          breed: entry.dog.breed,
          owner: entry.dog.owner
            ? {
                id: entry.dog.owner.id,
                first_name: entry.dog.owner.first_name,
                last_name: entry.dog.owner.last_name,
              }
            : null,
        }
      : null,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
}

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
  const { isSecretary, isAdmin } = useAuthContext();
  const isStaff = isSecretary || isAdmin;

  // Detect if we're in "results view mode" based on URL path
  const isResultsView = location.pathname.endsWith('/results');

  // Store hooks
  const { classes, updateClass, deleteClass } = useClassStoreCompat();
  const { dogs } = useDogStoreCompat();
  const dogsById = useMemo(() => new Map(dogs.map(d => [d.id, d])), [dogs]);
  const { trials, trialClasses: replicatedTrialClasses } = useTrialStore();
  const { shows } = useShowStore();

  // Get current class from URL parameter.
  // Fall back to the replication layer (trialStore.trialClasses) when the React
  // Query cache for getAllClasses hasn't loaded yet — classes created by the
  // wizard exist in IndexedDB before they've synced to Supabase.
  const classFromStore = useMemo(() => {
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

  // Cold-session fallback. A true guest's replicated class store is empty (guest sync is
  // skipped), which would dead-end the public `/results` route on "No Classes Available"
  // even though the release-gated results view returns data. Read the class identity directly
  // via PostgREST (anon-safe — class + trial only). Enabled ONLY when the store has nothing,
  // so warm/authed sessions are unaffected.
  const { data: publicClass } = usePublicClassById(classId, {
    enabled: !classFromStore && !!classId,
  });

  const currentClass = classFromStore ?? publicClass ?? null;

  // Filter classes to only show classes from the same trial
  const trialClasses = currentClass
    ? classes.filter(cls => cls.trialId === currentClass.trialId)
    : classes;

  // Resolve the class's show before loading entries so staff surfaces can use
  // the same show-scoped cache as Show Desk and Entry Management.
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
  const resolvedShowId = showId ?? parentShow?.id ?? parentTrial?.showId ?? '';

  const staffShowEntries = useSecretaryShowEntriesQuery(
    resolvedShowId,
    isStaff && Boolean(classId && resolvedShowId)
  );

  // --- Entry sources ---
  // 1. Database entries via React Query (primary source)
  const {
    entries: dbEntries,
    isLoading: dbEntriesLoading,
    error: dbEntriesError,
  } = useClassEntriesWithQuery(classId || '', !!classId && !isStaff);

  // 2. Local-only entries from the Zustand entry store (may include entries not yet synced)
  const localEntries = useEntriesByClass(classId || '');

  // Merge: use DB entries as the base, then add any local-only entries that
  // aren't already present (e.g., entries created via the wizard that haven't
  // been uploaded to Supabase yet).
  const localRawEntries = localEntries;

  // Raw DB entry rows with scoring columns intact (for ClassResultsTable)
  const {
    data: dbRawEntries = [],
    isLoading: dbRawEntriesLoading,
    error: dbRawEntriesError,
  } = useClassEntriesRaw(classId || undefined, !isStaff);

  const staffClassEntries = useMemo(
    () =>
      (staffShowEntries.data ?? [])
        .filter(entry => entry.class_id === classId)
        .map(secretaryEntryToRawRow),
    [classId, staffShowEntries.data]
  );
  const effectiveRawEntries = isStaff ? staffClassEntries : dbRawEntries;
  const staffEntriesError = staffShowEntries.isError
    ? staffShowEntries.error instanceof Error
      ? staffShowEntries.error.message
      : "We couldn't load entries for this show. Please retry."
    : null;

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

    // Build a lookup of raw DB entries for dog name resolution
    const rawById = new Map(dbRawEntries.map(r => [r.id, r]));

    // Start with database entries — resolve dog names from raw DB join data
    const dbDisplayEntries: ClassEntryDisplay[] = dbEntries.map(e => {
      // Backfill armband from local entry if DB version is empty
      let armband = e.armband || '';
      if (!armband) {
        const localEntry = localById.get(e.id);
        armband = localEntry?.registrationData?.armband || '';
      }

      // Get dog name from the raw DB join (mapDatabaseToEntry doesn't extract it)
      const raw = rawById.get(e.id);
      const dogName = raw?.dog?.call_name || raw?.dog?.name || e.dog || 'Unknown Dog';

      return {
        id: e.id,
        armband,
        handler: e.handler || '',
        dog: dogName,
        status: '' as ClassEntryDisplay['status'], // Scoring handled by rawEntries
        score: '',
        time: '',
        placement: '',
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
  }, [dbEntries, dbRawEntries, localEntries, dogsById]);

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
    localRawEntries,
    dbRawEntries: effectiveRawEntries,
    classEntries,
    entriesLoading: isStaff ? staffShowEntries.isLoading : dbEntriesLoading || dbRawEntriesLoading,
    entriesError: isStaff ? staffEntriesError : (dbRawEntriesError?.message ?? dbEntriesError),

    // Parent context
    parentTrial,
    parentShow,

    // Dogs for entry lookups
    dogs,

    // Actions
    updateClass,
    deleteClass,
  };
}
