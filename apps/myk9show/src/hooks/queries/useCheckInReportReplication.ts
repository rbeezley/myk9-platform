import {
  buildShowArmbandMaps,
  resolveEntryArmband,
  type ShowArmbandMaps,
} from '@/features/_shared/entryArmband';
import {
  replicatedArmbandsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
  type ReplicatedClass,
  type ReplicatedEntry,
} from '@/services/replication';
import { requireShowEntriesSynced } from '@/services/database/entries/requireShowEntriesSynced';
import type { CheckInEntryRow } from './useCheckInReport';

function isNotDeleted(entry: ReplicatedEntry) {
  return !entry.deletedAt && !entry.deleted_at;
}

function getEntryClassId(entry: ReplicatedEntry) {
  return entry.classId ?? entry.class_id ?? '';
}

function getEntryTrialId(entry: ReplicatedEntry, cls: ReplicatedClass | null) {
  return cls?.trialId ?? cls?.trial_id ?? entry.trialId ?? entry.trial_id ?? '';
}

function getEntryCheckInStatus(entry: ReplicatedEntry) {
  return entry.checkInStatus ?? entry.check_in_status ?? 'no-status';
}

function getDogCallName(entry: ReplicatedEntry) {
  return entry.dogCallName ?? entry.dog_call_name ?? null;
}

function getDogBreed(entry: ReplicatedEntry) {
  return entry.dogBreed ?? entry.dog_breed ?? null;
}

function splitHandlerName(handlerName: string | undefined) {
  if (!handlerName) return { firstName: null, lastName: null };
  const parts = handlerName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

function armbandNumberForEntry(entry: ReplicatedEntry, maps: ShowArmbandMaps) {
  const value = resolveEntryArmband(
    { ...entry, armband: entry.armband ?? entry.armbandNumber ?? entry.armband_number },
    maps
  );
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function getClassForEntry(
  entry: ReplicatedEntry,
  cache: Map<string, Promise<ReplicatedClass | null>>
) {
  const classId = getEntryClassId(entry);
  if (!classId) return null;
  return (
    cache.get(classId) ??
    cache.set(classId, replicatedClassesTable.getClassById(classId)).get(classId)!
  );
}

export async function fetchReplicatedCheckInEntries(showId: string): Promise<CheckInEntryRow[]> {
  // MYK9-761: a never-synced show's rows are only what this device wrote.
  await requireShowEntriesSynced(showId);
  const [entries, trials, armbands] = await Promise.all([
    replicatedEntriesTable.getEntriesByShow(showId),
    replicatedTrialsTable.getTrialsByShow(showId),
    replicatedArmbandsTable.getByShow(showId),
  ]);
  const trialsById = new Map(trials.map(trial => [trial.id, trial]));
  const armbandMaps = buildShowArmbandMaps(armbands);
  const classCache = new Map<string, Promise<ReplicatedClass | null>>();
  const activeEntries = entries.filter(isNotDeleted);

  return Promise.all(
    activeEntries.map(async entry => {
      const cls = await getClassForEntry(entry, classCache);
      const trialId = getEntryTrialId(entry, cls);
      const trial = trialId ? (trialsById.get(trialId) ?? null) : null;
      const handler = splitHandlerName(entry.handlerName ?? entry.handler);

      return {
        id: entry.id,
        dog_id: entry.dogId ?? '',
        handler_id: entry.handlerId ?? '',
        check_in_status: getEntryCheckInStatus(entry),
        armband_number: armbandNumberForEntry(entry, armbandMaps),
        handler_first_name: handler.firstName,
        handler_last_name: handler.lastName,
        dog_call_name: getDogCallName(entry),
        dog_breed_name: getDogBreed(entry),
        class_id: getEntryClassId(entry),
        element: cls?.element ?? null,
        level: cls?.level ?? null,
        section: cls?.section ?? null,
        trial_id: trialId,
        trial_date: trial?.date ?? trial?.trial_date ?? '',
        trial_name: trial?.name ?? null,
        trial_number: trial?.trialNumber ?? trial?.trial_number ?? null,
      };
    })
  );
}
