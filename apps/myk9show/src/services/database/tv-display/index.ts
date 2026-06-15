import { withReplicationFallback } from '../_shared/replication-fallback';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import {
  getClassStatus,
  getEntryFinalPlacement,
  getEntryIsInRing,
  getEntryIsScored,
  getEntryResultStatus,
  getEntrySearchTime,
  getEntryTotalScore,
  getJudgeName,
  groupEntriesByClass,
  isDeleted,
  mapClass,
  mapReplicatedDog,
  mapReplicatedEntry,
  mapShow,
  TV_ACTIVE_STATUSES,
} from './mappers';
import { getPostgrestTVDisplayData, getPostgrestTVDisplayResults } from './postgrest';
import type { TVCompletedClass, TVDisplayData } from './types';

export type {
  TVClass,
  TVCompletedClass,
  TVDisplayData,
  TVDogInfo,
  TVEntry,
  TVPlacement,
  TVShowInfo,
} from './types';

async function loadReplicatedClassesForShow(
  showId: string,
  trialId?: string
): Promise<{ trials: ReplicatedTrial[]; classes: ReplicatedClass[] }> {
  const showTrials = (await replicatedTrialsTable.getTrialsByShow(showId)).filter(
    trial => !trialId || trial.id === trialId
  );
  const classGroups = await Promise.all(
    showTrials.map(trial => replicatedClassesTable.getClassesByTrial(trial.id))
  );
  return {
    trials: showTrials,
    classes: classGroups.flat().filter(cls => !isDeleted(cls)),
  };
}

async function getReplicatedTVDisplayData(
  showId: string,
  trialId?: string
): Promise<TVDisplayData> {
  const [showRow, classBundle, entries, dogs] = await Promise.all([
    replicatedShowsTable.getShowById(showId),
    loadReplicatedClassesForShow(showId, trialId),
    replicatedEntriesTable.getEntriesByShow(showId),
    replicatedDogsTable.getAllDogs(),
  ]);

  if (!showRow) return { show: null, classes: [] };

  const trialsById = new Map(classBundle.trials.map(trial => [trial.id, trial]));
  const dogsById = new Map(dogs.map(dog => [dog.id, dog]));
  const activeClasses = classBundle.classes.filter(cls =>
    TV_ACTIVE_STATUSES.has(getClassStatus(cls) ?? '')
  );
  const activeClassIds = new Set(activeClasses.map(cls => cls.id));
  const visibleEntryRows = entries.filter(
    entry =>
      !isDeleted(entry) &&
      entry.classId &&
      activeClassIds.has(entry.classId) &&
      (!getEntryIsScored(entry) || getEntryIsInRing(entry))
  );
  const classIdByEntryId = new Map(visibleEntryRows.map(entry => [entry.id, entry.classId!]));
  const entriesByClass = groupEntriesByClass(
    visibleEntryRows.map(entry =>
      mapReplicatedEntry(entry, entry.dogId ? dogsById.get(entry.dogId) : null)
    ),
    classIdByEntryId
  );

  const classes = activeClasses.map(cls =>
    mapClass(
      cls,
      cls.trialId ? trialsById.get(cls.trialId) : undefined,
      entriesByClass.get(cls.id) ?? [],
      entries.filter(entry => entry.classId === cls.id && !isDeleted(entry))
    )
  );

  return { show: mapShow(showRow), classes };
}

async function getReplicatedTVDisplayResults(
  showId: string,
  trialId?: string
): Promise<TVCompletedClass[]> {
  const [classBundle, entries, dogs] = await Promise.all([
    loadReplicatedClassesForShow(showId, trialId),
    replicatedEntriesTable.getEntriesByShow(showId),
    replicatedDogsTable.getAllDogs(),
  ]);

  const dogsById = new Map(dogs.map(dog => [dog.id, dog]));
  const completedClasses = classBundle.classes.filter(cls => cls.isScoringFinalized === true);
  const completedClassIds = new Set(completedClasses.map(cls => cls.id));
  const relevantEntries = entries.filter(
    entry => !isDeleted(entry) && entry.classId && completedClassIds.has(entry.classId)
  );

  return completedClasses.map(cls => {
    const classEntries = relevantEntries.filter(entry => entry.classId === cls.id);
    const qualifiedEntries = classEntries.filter(
      entry => getEntryResultStatus(entry) === 'qualified'
    );
    const fastestTime = qualifiedEntries.reduce<number | null>((fastest, entry) => {
      const time = getEntrySearchTime(entry);
      if (time == null) return fastest;
      return fastest == null ? time : Math.min(fastest, time);
    }, null);
    const placements = classEntries
      .map(entry => ({ entry, placement: getEntryFinalPlacement(entry) }))
      .filter((row): row is { entry: ReplicatedEntry; placement: number } => {
        return row.placement != null && row.placement >= 1 && row.placement <= 4;
      })
      .sort((a, b) => a.placement - b.placement)
      .map(({ entry, placement }) => ({
        placement,
        armband: entry.armband ?? null,
        handler: entry.handler ?? entry.handlerName ?? entry.handler_name ?? null,
        searchTime: getEntrySearchTime(entry),
        totalScore: getEntryTotalScore(entry),
        dog: mapReplicatedDog(entry.dogId ? dogsById.get(entry.dogId) : null),
      }));

    return {
      id: cls.id,
      name: cls.name,
      element: cls.element ?? null,
      level: cls.level ?? null,
      judgeName: getJudgeName(cls),
      totalEntries: cls.totalEntriesCount ?? classEntries.length,
      qualifiedCount: qualifiedEntries.length,
      fastestTime,
      placements,
    };
  });
}

export async function getTVDisplayData(showId: string, trialId?: string): Promise<TVDisplayData> {
  try {
    return await withReplicationFallback(
      () => getReplicatedTVDisplayData(showId, trialId),
      () => getPostgrestTVDisplayData(showId, trialId),
      'tv_display',
      'select_active_data'
    );
  } catch {
    return { show: null, classes: [] };
  }
}

export async function getTVDisplayResults(
  showId: string,
  trialId?: string
): Promise<TVCompletedClass[]> {
  try {
    return await withReplicationFallback(
      () => getReplicatedTVDisplayResults(showId, trialId),
      () => getPostgrestTVDisplayResults(showId, trialId),
      'tv_display',
      'select_results'
    );
  } catch {
    return [];
  }
}
