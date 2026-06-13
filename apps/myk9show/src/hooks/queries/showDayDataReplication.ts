import {
  replicatedClassesTable,
  replicatedClubsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
  type ReplicatedClass,
  type ReplicatedClub,
  type ReplicatedDog,
  type ReplicatedEntry,
  type ReplicatedShow,
  type ReplicatedTrial,
} from '@/services/replication';
import type {
  RingProgressRow,
  ShowDayCheckRow,
  ShowDayDetailRow,
} from '@/types/show-day-types';

type ReplicatedShowDayContext = {
  entry: ReplicatedEntry;
  dog: ReplicatedDog | null;
  cls: ReplicatedClass;
  trial: ReplicatedTrial;
  show: ReplicatedShow;
  club: ReplicatedClub | null;
};

function isNotDeleted(entry: ReplicatedEntry) {
  return !entry.deletedAt && !entry.deleted_at;
}

function getEntryClassId(entry: ReplicatedEntry) {
  return entry.classId ?? entry.class_id ?? null;
}

function getEntryHandlerId(entry: ReplicatedEntry) {
  return entry.handlerId ?? (entry as { handler_id?: string | null }).handler_id ?? null;
}

function getEntryTrialId(entry: ReplicatedEntry) {
  return entry.trialId ?? entry.trial_id ?? null;
}

function getEntryCheckInStatus(entry: ReplicatedEntry) {
  return entry.checkInStatus ?? entry.check_in_status ?? null;
}

function getEntryIsScored(entry: ReplicatedEntry) {
  return entry.isScored ?? entry.is_scored ?? false;
}

function getEntryResultStatus(entry: ReplicatedEntry) {
  return entry.resultStatus ?? entry.result_status ?? null;
}

function getEntryIsInRing(entry: ReplicatedEntry) {
  return entry.isInRing ?? entry.is_in_ring ?? false;
}

function getEntryScoringCompletedAt(entry: ReplicatedEntry) {
  return entry.scoringCompletedAt ?? entry.scoring_completed_at ?? null;
}

function getEntryRunOrder(entry: ReplicatedEntry) {
  return entry.runOrder ?? (entry as { run_order?: number | null }).run_order ?? null;
}

function ringProgressSortTimestamp(value: string | null) {
  return value ?? '\uFFFF';
}

function getClassTrialId(cls: ReplicatedClass) {
  return cls.trialId ?? cls.trial_id ?? null;
}

function getClassStatus(cls: ReplicatedClass) {
  return cls.classStatus ?? 'upcoming';
}

function showClubName(club: ReplicatedClub | null) {
  return club ? { name: club.name } : null;
}

function showLocation(show: ReplicatedShow) {
  return show.location ?? '';
}

async function resolveClass(
  entry: ReplicatedEntry,
  classCache: Map<string, Promise<ReplicatedClass | null>>
) {
  const classId = getEntryClassId(entry);
  if (!classId) return null;
  return (
    classCache.get(classId) ??
    classCache.set(classId, replicatedClassesTable.getClassById(classId)).get(classId)!
  );
}

async function resolveTrial(
  entry: ReplicatedEntry,
  cls: ReplicatedClass | null,
  trialCache: Map<string, Promise<ReplicatedTrial | null>>
) {
  const trialId = getEntryTrialId(entry) ?? (cls ? getClassTrialId(cls) : null);
  if (!trialId) return null;
  return (
    trialCache.get(trialId) ??
    trialCache.set(trialId, replicatedTrialsTable.getTrialById(trialId)).get(trialId)!
  );
}

async function resolveDog(
  entry: ReplicatedEntry,
  dogCache: Map<string, Promise<ReplicatedDog | null>>
) {
  const dogId = entry.dogId;
  if (!dogId) return null;
  return (
    dogCache.get(dogId) ??
    dogCache.set(dogId, replicatedDogsTable.getDogById(dogId)).get(dogId)!
  );
}

async function resolveShow(
  trial: ReplicatedTrial,
  showCache: Map<string, Promise<ReplicatedShow | null>>
) {
  const showId = trial.showId;
  if (!showId) return null;
  return (
    showCache.get(showId) ??
    showCache.set(showId, replicatedShowsTable.getShowById(showId)).get(showId)!
  );
}

async function resolveClub(
  show: ReplicatedShow,
  clubCache: Map<string, Promise<ReplicatedClub | null>>
) {
  const clubId = show.clubId;
  if (!clubId) return null;
  return (
    clubCache.get(clubId) ??
    clubCache.set(clubId, replicatedClubsTable.getClubById(clubId)).get(clubId)!
  );
}

async function buildShowDayContext(
  entry: ReplicatedEntry,
  caches: {
    classCache: Map<string, Promise<ReplicatedClass | null>>;
    trialCache: Map<string, Promise<ReplicatedTrial | null>>;
    dogCache: Map<string, Promise<ReplicatedDog | null>>;
    showCache: Map<string, Promise<ReplicatedShow | null>>;
    clubCache: Map<string, Promise<ReplicatedClub | null>>;
  }
): Promise<ReplicatedShowDayContext | null> {
  const cls = await resolveClass(entry, caches.classCache);
  const trial = await resolveTrial(entry, cls, caches.trialCache);
  if (!cls || !trial) return null;
  const show = await resolveShow(trial, caches.showCache);
  if (!show) return null;
  const [dog, club] = await Promise.all([
    resolveDog(entry, caches.dogCache),
    resolveClub(show, caches.clubCache),
  ]);

  return { entry, dog, cls, trial, show, club };
}

async function buildContexts(
  entries: ReplicatedEntry[]
): Promise<ReplicatedShowDayContext[]> {
  const caches = {
    classCache: new Map<string, Promise<ReplicatedClass | null>>(),
    trialCache: new Map<string, Promise<ReplicatedTrial | null>>(),
    dogCache: new Map<string, Promise<ReplicatedDog | null>>(),
    showCache: new Map<string, Promise<ReplicatedShow | null>>(),
    clubCache: new Map<string, Promise<ReplicatedClub | null>>(),
  };
  const contexts = await Promise.all(entries.map(entry => buildShowDayContext(entry, caches)));
  return contexts.filter((context): context is ReplicatedShowDayContext => context !== null);
}

function toCheckRow(context: ReplicatedShowDayContext): ShowDayCheckRow {
  const { entry, trial, show, club } = context;
  return {
    id: entry.id,
    trial: {
      id: trial.id,
      date: trial.date,
      show: {
        id: show.id,
        name: show.name,
        location: showLocation(show),
        status: show.status ?? '',
        start_date: show.startDate,
        end_date: show.endDate,
        club: showClubName(club),
      },
    },
  };
}

function toDetailRow(context: ReplicatedShowDayContext): ShowDayDetailRow {
  const { entry, dog, cls, trial, show, club } = context;
  return {
    id: entry.id,
    check_in_status: getEntryCheckInStatus(entry),
    armband: entry.armband ?? null,
    run_order: getEntryRunOrder(entry),
    is_scored: getEntryIsScored(entry),
    result_status: getEntryResultStatus(entry),
    is_in_ring: getEntryIsInRing(entry),
    dog: {
      id: entry.dogId ?? dog?.id ?? '',
      call_name: entry.dogCallName ?? entry.dog_call_name ?? dog?.callName ?? dog?.name ?? '',
    },
    class: {
      id: cls.id,
      name: cls.name,
      element: cls.element ?? null,
      level: cls.level ?? null,
      status: getClassStatus(cls),
      total_entries_count: cls.totalEntriesCount ?? 0,
      scored_count: cls.scoredCount ?? 0,
    },
    trial: {
      id: trial.id,
      date: trial.date,
      show: {
        id: show.id,
        name: show.name,
        location: showLocation(show),
        status: show.status ?? '',
        club: showClubName(club),
      },
    },
  };
}

function toProgressRow(context: ReplicatedShowDayContext): RingProgressRow | null {
  const { entry, dog } = context;
  const isInRing = getEntryIsInRing(entry);
  const isScored = getEntryIsScored(entry);
  if (!isInRing && !isScored) return null;

  const classId = getEntryClassId(entry);
  if (!classId) return null;

  return {
    class_id: classId,
    is_in_ring: isInRing,
    is_scored: isScored,
    scoring_completed_at: getEntryScoringCompletedAt(entry),
    run_order: getEntryRunOrder(entry),
    dog: {
      call_name: entry.dogCallName ?? entry.dog_call_name ?? dog?.callName ?? dog?.name ?? '',
    },
  };
}

export async function fetchReplicatedShowDayCheck(
  userId: string,
  today: string
): Promise<ShowDayCheckRow[]> {
  const entries = (await replicatedEntriesTable.getAll()).filter(
    entry => isNotDeleted(entry) && getEntryHandlerId(entry) === userId
  );
  const contexts = await buildContexts(entries);
  return contexts.filter(context => context.trial.date === today).map(toCheckRow);
}

export async function fetchReplicatedShowDayDetails(
  userId: string,
  today: string
): Promise<ShowDayDetailRow[]> {
  const entries = (await replicatedEntriesTable.getAll()).filter(
    entry => isNotDeleted(entry) && getEntryHandlerId(entry) === userId
  );
  const contexts = await buildContexts(entries);
  return contexts
    .filter(context => context.trial.date === today)
    .map(toDetailRow)
    .sort(
      (a, b) =>
        (a.run_order ?? Number.MAX_SAFE_INTEGER) - (b.run_order ?? Number.MAX_SAFE_INTEGER)
    );
}

export async function fetchReplicatedRingProgress(
  classIds: string[]
): Promise<RingProgressRow[]> {
  if (classIds.length === 0) return [];

  const classIdSet = new Set(classIds);
  const entries = (await replicatedEntriesTable.getAll()).filter(entry => {
    const classId = getEntryClassId(entry);
    return isNotDeleted(entry) && classId !== null && classIdSet.has(classId);
  });
  const contexts = await buildContexts(entries);
  return contexts
    .map(toProgressRow)
    .filter((row): row is RingProgressRow => row !== null)
    .sort(
      (a, b) =>
        ringProgressSortTimestamp(a.scoring_completed_at).localeCompare(
          ringProgressSortTimestamp(b.scoring_completed_at)
        ) ||
        (a.run_order ?? Number.MAX_SAFE_INTEGER) - (b.run_order ?? Number.MAX_SAFE_INTEGER)
    );
}
