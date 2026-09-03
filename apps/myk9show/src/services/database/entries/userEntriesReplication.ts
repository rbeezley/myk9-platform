import { supabase } from '../supabaseClient';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { withholdScoredResultColumns } from './resultVisibility';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import { getTrialTimezone } from '@/features/registries';

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
    const show = entry.showId ? (maps.showsMap.get(entry.showId) ?? null) : null;
    const row = mapReplicatedEntryToDbRow(entry, {
      dog: entry.dogId ? (maps.dogsMap.get(entry.dogId) ?? null) : null,
      cls,
      show,
      trial: trial
        ? {
            id: trial.id,
            trial_type: trial.trialType ?? null,
            date: trial.date ?? trial.trial_date ?? null,
            trial_number: trial.trialNumber ?? trial.trial_number ?? null,
            // Keeps the offline path's trial shape identical to the PostgREST
            // embed. Without it the amount-due deadline would reckon "past" in
            // a different timezone offline than online.
            timezone: getTrialTimezone(trial),
          }
        : null,
    });
    if (!show && entry.showId && entry.showDeletedAt) {
      row.show = {
        id: entry.showId,
        name: entry.showName ?? 'Unknown Show',
        start_date: entry.showStartDate ?? null,
        end_date: entry.showEndDate ?? null,
        deleted_at: entry.showDeletedAt,
      };
    }
    // Mirror the PostgREST `show:show_id(..., trials:trials(...))` embed. The
    // amount-due deadline picks the show's PRIMARY trial's timezone, which
    // needs every trial of the show, not just the one this entry is in.
    if (entry.showId && row.show && typeof row.show === 'object') {
      (row.show as Record<string, unknown>).trials = [...maps.trialsMap.values()]
        .filter(t => t.showId === entry.showId)
        .map(t => ({
          id: t.id,
          date: t.date ?? t.trial_date ?? null,
          timezone: t.timezone ?? null,
        }));
    }

    const dog = entry.dogId ? (maps.dogsMap.get(entry.dogId) ?? null) : null;
    const enrollment = entry.registrationId ? enrollmentsMap.get(entry.registrationId) : null;
    if (enrollment) {
      row.registration = enrollment;
    }
    row.class_results_released_at = cls?.resultsReleasedAt ?? cls?.results_released_at ?? null;
    row.dog_image_url =
      (row.dog_image_url as string | null | undefined) ??
      (row.image_url as string | null | undefined) ??
      dog?.imageUrl ??
      null;
    // The per-class result-visibility cascade is NOT in replication scope, so
    // the raw scored columns synced here are withheld until the cascade-aware
    // server view (preferred by getUserEntries when any entry is scored) can
    // release them. Safe-by-default: never leak placement/result/time/faults
    // from the offline path. See ./resultVisibility for the full rationale.
    withholdScoredResultColumns(row);
    return row;
  });

  return { data, error: null };
}
