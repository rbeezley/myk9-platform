import { deriveResultReleaseDisplay } from '@/features/result-card';
import type { OwnShowResult } from '@/features/at-show/myAtShowEntryDetails.helpers';
import type { SyncableShowEntry } from '@/store/entry-store-types';
import { dbSecondsToInputFormat } from '@/utils/scoringMappings';
import type { EnrichedShowEntry } from './useShowEntriesForUser';

type ScheduleResult = NonNullable<EnrichedShowEntry['result']>;

/**
 * A staff viewer who can see the whole show reads results from the device
 * rows, which they are entitled to see unmasked.
 */
function fromDeviceRow(
  compData: SyncableShowEntry['competitionData'],
  classResultsReleasedAt: string | null | undefined
): ScheduleResult | undefined {
  if (!compData) return undefined;
  return {
    qualified: compData.qualified ?? false,
    ...(compData.time != null ? { time: compData.time } : {}),
    ...(compData.placement ? { placement: parseInt(compData.placement, 10) } : {}),
    ...(compData.faults != null ? { faults: compData.faults } : {}),
    isPreliminary: deriveResultReleaseDisplay({
      resultsReleasedAt: classResultsReleasedAt,
      resultStatus: compData.qualified ? 'qualified' : 'nq',
      finalPlacement: null,
    }).isPreliminary,
  };
}

/** Everyone else reads the exhibitor's own masked result, nothing else. */
function fromOwnRead(own: OwnShowResult | undefined): ScheduleResult | undefined {
  const status = own?.resultStatus;
  if (!own?.isScored || !status || status === 'pending') return undefined;
  const time = dbSecondsToInputFormat(own.searchTimeSeconds);
  return {
    qualified: status === 'qualified',
    ...(time ? { time } : {}),
    ...(own.finalPlacement != null ? { placement: own.finalPlacement } : {}),
    ...(own.totalFaults != null ? { faults: own.totalFaults } : {}),
    isPreliminary: deriveResultReleaseDisplay({
      resultsReleasedAt: own.resultsReleasedAt,
      resultStatus: status,
      finalPlacement: null,
    }).isPreliminary,
  };
}

/**
 * The run schedule's result for one entry (MYK9-1115). The device rows (entry
 * store and the replica-backed show read) are unmasked when a staff session
 * synced the show on this device, and sign-out does not clear them, so an
 * exhibitor's result must come from their own masked read
 * (`useMyShowResults`), the source My Entries and the at-show row use.
 */
export function buildScheduleResult(
  canSeeAll: boolean,
  compData: SyncableShowEntry['competitionData'],
  own: OwnShowResult | undefined,
  classResultsReleasedAt: string | null | undefined
): ScheduleResult | undefined {
  return canSeeAll ? fromDeviceRow(compData, classResultsReleasedAt) : fromOwnRead(own);
}
