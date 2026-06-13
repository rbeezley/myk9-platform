import {
  replicatedClassesTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  type ReplicatedClass,
  type ReplicatedDog,
  type ReplicatedEntry,
} from '@/services/replication';

type DayOfReadEntry = {
  id: string;
  class_id: string | null;
  trial_id: string | null;
  entry_status: string | null;
  jump_height: string | null;
  run_order?: number | null;
  handler: string | null;
  armband: string | null;
  entry_fee?: number | null;
  payment_status?: string | null;
  special_requests?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
    trial_id?: string;
  } | null;
};

type SortMode = 'run-order' | 'created-asc' | 'updated-desc' | 'class-id';

function isNotDeleted(entry: ReplicatedEntry) {
  return !entry.deletedAt && !entry.deleted_at;
}

function getEntryClassId(entry: ReplicatedEntry) {
  return entry.classId ?? entry.class_id ?? null;
}

function getEntryDogId(entry: ReplicatedEntry) {
  return entry.dogId ?? null;
}

function getEntryStatus(entry: ReplicatedEntry) {
  return entry.entryStatus ?? entry.entry_status ?? null;
}

function getEntryTrialId(entry: ReplicatedEntry) {
  return entry.trialId ?? entry.trial_id ?? null;
}

function getEntryRunOrder(entry: ReplicatedEntry) {
  return entry.runOrder ?? null;
}

function getEntryCreatedAt(entry: ReplicatedEntry) {
  return entry.created_at ?? entry.createdAt ?? null;
}

function getEntryUpdatedAt(entry: ReplicatedEntry) {
  return entry.updated_at ?? null;
}

function timestampValue(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareDayOfEntries(a: DayOfReadEntry, b: DayOfReadEntry, sort: SortMode) {
  switch (sort) {
    case 'run-order':
      return (
        (a.run_order ?? Number.MAX_SAFE_INTEGER) - (b.run_order ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id)
      );
    case 'created-asc':
      return timestampValue(a.created_at) - timestampValue(b.created_at) || a.id.localeCompare(b.id);
    case 'updated-desc':
      return timestampValue(b.updated_at) - timestampValue(a.updated_at) || a.id.localeCompare(b.id);
    case 'class-id':
      return (a.class_id ?? '').localeCompare(b.class_id ?? '') || a.id.localeCompare(b.id);
  }
}

function toDogPayload(dog: ReplicatedDog | null, entry: ReplicatedEntry): DayOfReadEntry['dog'] {
  const dogId = getEntryDogId(entry);
  if (!dogId) return null;

  return {
    id: dogId,
    name: dog?.name ?? '',
    call_name: dog?.callName ?? null,
  };
}

function getClassNumber(cls: ReplicatedClass | null) {
  return (
    (cls as { class_number?: string | null; classNumber?: string | null } | null)?.class_number ??
    (cls as { classNumber?: string | null } | null)?.classNumber ??
    null
  );
}

function toClassPayload(
  cls: ReplicatedClass | null,
  entry: ReplicatedEntry
): DayOfReadEntry['class'] {
  const classId = getEntryClassId(entry);
  if (!classId) return null;

  const trialId = cls?.trialId ?? cls?.trial_id ?? getEntryTrialId(entry);

  return {
    id: classId,
    name: cls?.name ?? '',
    class_number: getClassNumber(cls),
    ...(trialId ? { trial_id: trialId } : {}),
  };
}

async function enrichDayOfEntry(
  entry: ReplicatedEntry,
  classCache: Map<string, Promise<ReplicatedClass | null>>,
  dogCache: Map<string, Promise<ReplicatedDog | null>>
): Promise<DayOfReadEntry> {
  const classId = getEntryClassId(entry);
  const dogId = getEntryDogId(entry);
  const classPromise =
    classId === null
      ? Promise.resolve(null)
      : (classCache.get(classId) ??
        classCache.set(classId, replicatedClassesTable.getClassById(classId)).get(classId)!);
  const dogPromise =
    dogId === null
      ? Promise.resolve(null)
      : (dogCache.get(dogId) ??
        dogCache.set(dogId, replicatedDogsTable.getDogById(dogId)).get(dogId)!);
  const [cls, dog] = await Promise.all([classPromise, dogPromise]);

  return {
    id: entry.id,
    class_id: classId,
    trial_id: getEntryTrialId(entry),
    entry_status: getEntryStatus(entry),
    jump_height: entry.jumpHeight ?? null,
    run_order: getEntryRunOrder(entry),
    handler: entry.handler ?? null,
    armband: entry.armband ?? null,
    entry_fee: entry.entryFee ?? null,
    payment_status: entry.paymentStatus ?? null,
    special_requests: entry.specialRequests ?? entry.special_requests ?? null,
    created_at: getEntryCreatedAt(entry),
    updated_at: getEntryUpdatedAt(entry),
    dog: toDogPayload(dog, entry),
    class: toClassPayload(cls, entry),
  };
}

export async function getReplicatedDayOfEntries(
  showId: string,
  statuses: readonly string[],
  sort: SortMode
): Promise<DayOfReadEntry[]> {
  const entries = await replicatedEntriesTable.getEntriesByShow(showId);
  const classCache = new Map<string, Promise<ReplicatedClass | null>>();
  const dogCache = new Map<string, Promise<ReplicatedDog | null>>();
  const statusSet = new Set(statuses);
  const filtered = entries.filter(entry => isNotDeleted(entry) && statusSet.has(getEntryStatus(entry) ?? ''));
  const enriched = await Promise.all(
    filtered.map(entry => enrichDayOfEntry(entry, classCache, dogCache))
  );

  return enriched.sort((a, b) => compareDayOfEntries(a, b, sort));
}
