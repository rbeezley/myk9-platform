import { supabase } from '../supabaseClient';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

interface ReplicatedUserEntryRelationMaps {
  dogsMap: ReadonlyMap<string, unknown>;
  classesMap: ReadonlyMap<string, unknown>;
  showsMap: ReadonlyMap<string, unknown>;
}

interface ReplicatedUserEntryMaps {
  dogsMap: ReadonlyMap<string, ReplicatedDog>;
  classesMap: ReadonlyMap<string, ReplicatedClass>;
  showsMap: ReadonlyMap<string, ReplicatedShow>;
  trialsMap: ReadonlyMap<string, ReplicatedTrial>;
}

export function findMissingReplicatedUserEntryRelations(
  entries: Pick<ReplicatedEntry, 'id' | 'classId' | 'dogId' | 'showId'>[],
  maps: ReplicatedUserEntryRelationMaps
): string[] {
  const missing = new Set<string>();

  for (const entry of entries) {
    if (entry.classId && !maps.classesMap.has(entry.classId)) {
      missing.add(`class:${entry.classId}`);
    }
    if (entry.dogId && !maps.dogsMap.has(entry.dogId)) {
      missing.add(`dog:${entry.dogId}`);
    }
    if (entry.showId && !maps.showsMap.has(entry.showId)) {
      missing.add(`show:${entry.showId}`);
    }
  }

  return Array.from(missing);
}

export async function buildReplicatedUserEntryRows(
  entries: ReplicatedEntry[],
  maps: ReplicatedUserEntryMaps
): Promise<{ data: Record<string, unknown>[]; error: null }> {
  // Load enrollment payment fields (not in the replication store)
  const enrollmentIds = [...new Set(entries.map(e => e.registrationId).filter(Boolean))];
  const enrollmentsMap = new Map<
    string,
    {
      id: string;
      confirmation_number: string;
      payment_status: string;
      payment_reference: string | null;
      paid_amount: number | null;
    }
  >();
  if (enrollmentIds.length > 0) {
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('id, confirmation_number, payment_status, payment_reference, paid_amount')
      .in('id', enrollmentIds as string[]);
    if (enrollments) {
      for (const e of enrollments) {
        enrollmentsMap.set(e.id, e);
      }
    }
  }

  const data = entries.map(entry => {
    // Resolve the entry's discipline via its class -> trial. Entries carry
    // class_id (not trial_id) in the replication store, so hop through the
    // class to read trial_type. The trial sub-object shape mirrors the
    // PostgREST `trial:trial_id(id, trial_type)` join so transformEntry reads
    // it identically on both paths.
    const cls = entry.classId ? (maps.classesMap.get(entry.classId) ?? null) : null;
    const trial = cls?.trialId ? (maps.trialsMap.get(cls.trialId) ?? null) : null;
    const row = mapReplicatedEntryToDbRow(entry, {
      dog: entry.dogId ? (maps.dogsMap.get(entry.dogId) ?? null) : null,
      cls,
      show: entry.showId ? (maps.showsMap.get(entry.showId) ?? null) : null,
      trial: trial
        ? {
            id: trial.id,
            trial_type: trial.trialType ?? null,
            date: trial.date ?? trial.trial_date ?? null,
            trial_number: trial.trialNumber ?? trial.trial_number ?? null,
          }
        : null,
    });
    const enrollment = entry.registrationId ? enrollmentsMap.get(entry.registrationId) : null;
    if (enrollment) {
      row.registration = enrollment;
    }
    return row;
  });

  return { data, error: null };
}
