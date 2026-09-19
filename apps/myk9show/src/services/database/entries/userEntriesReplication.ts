import { supabase } from '../supabaseClient';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '@myk9/core';
import { logger } from '@/services/LoggingService';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { withholdScoredResultColumns } from './resultVisibility';
import { applyOrderReferenceRule } from './orderReferenceRule';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import { getTrialTimezone } from '@/features/registries';

interface ReplicatedUserEntryMaps {
  dogsMap: ReadonlyMap<string, ReplicatedDog>;
  classesMap: ReadonlyMap<string, ReplicatedClass>;
  showsMap: ReadonlyMap<string, ReplicatedShow>;
  trialsMap: ReadonlyMap<string, ReplicatedTrial>;
}

export async function buildReplicatedUserEntryRows(
  entries: ReplicatedEntry[],
  maps: ReplicatedUserEntryMaps
): Promise<{ data: Record<string, unknown>[]; error: null }> {
  // This function only ever runs on the REPLICA path, and every replica path
  // already reports a non-`confirmed` `UserEntriesSource`, which withholds
  // money outright. A separate best-effort-enrichment flag therefore said
  // nothing the source did not already say, and nothing ever read it
  // (MYK9-629 restructure 5). The enrollment read stays best-effort and logged.
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
    // This is the OFFLINE path's one network call, and it is best-effort
    // enrichment: confirmation numbers and the order's payment status. It must
    // therefore never be what stops the page from rendering.
    //
    // It is reached mainly when the authoritative view failed or TIMED OUT —
    // i.e. on the same dead network. Without its own deadline a captive portal
    // hangs here instead, and `getUserEntries` never settles at all, which is
    // exactly the failure the view's timeout was added to end. On expiry we
    // carry on with an empty map: the rows still render, they just fall back to
    // the id-derived confirmation number and their own `payment_status`.
    try {
      const { data: enrollments } = await withTimeout(
        supabase
          .from('enrollments')
          .select('id, confirmation_number, payment_status, payment_reference, paid_amount')
          .in('id', enrollmentIds as string[])
          .abortSignal(AbortSignal.timeout(DEFAULT_TIMEOUT_MS)),
        DEFAULT_TIMEOUT_MS,
        'My Entries enrollment enrichment'
      );
      if (enrollments) {
        for (const e of enrollments) {
          enrollmentsMap.set(e.id, e);
        }
      }
    } catch (error) {
      logger.warn(
        'Enrollment enrichment unavailable; rendering replicated entries alone',
        'database',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
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
    // MYK9-659: the enrichment above is the one NETWORK call on the offline
    // path, so on the dead show-day network that put us here it returns
    // nothing — and the receipt then fell through to a raw enrollment UUID,
    // printing a different identifier than the same order shows online. The
    // confirmation number now replicates WITH the entry (migration
    // 20260918193700), so the row carries it and `applyOrderReferenceRule` —
    // the SAME function the online read calls — decides which token wins.
    // Identical precedence on both paths is the point; see that module.
    //
    // Absent when the replica row predates that push, which is honest: the
    // receipt prints no reference rather than an id nobody can quote.
    if (entry.registrationConfirmationNumber) {
      row.registration_confirmation_number = entry.registrationConfirmationNumber;
    }
    applyOrderReferenceRule(row);
    row.class_results_released_at = cls?.resultsReleasedAt ?? cls?.results_released_at ?? null;
    row.dog_image_url =
      (row.dog_image_url as string | null | undefined) ??
      (row.image_url as string | null | undefined) ??
      dog?.imageUrl ??
      null;
    // The per-class result-visibility cascade is NOT in replication scope, so
    // the raw scored columns synced here are withheld until the cascade-aware
    // server view can release them. That view is ALWAYS preferred by
    // getUserEntries; this replica is only its offline fallback. Safe-by-default: never leak placement/result/time/faults
    // from the offline path. See ./resultVisibility for the full rationale.
    withholdScoredResultColumns(row);
    return row;
  });

  return { data, error: null };
}
