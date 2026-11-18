import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { RecordingFeeRate } from '@myk9/core';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import type { ReportAsyncData } from '@/lib/reports/types';

/**
 * MYK9-2044: the registry recording fee rate list (`registry_recording_fee_rates`), which the
 * AKC Trial Secretary Report reads to find the rate in force on the trial date.
 *
 * This is an online read of a handful of rows that a site admin edits, resolved by the report
 * host like the show's officials (`useTrialOfficials`) rather than by the report itself. A
 * secretary runs that report at the end of a show, possibly with no signal, so the last list
 * read on this device is kept (localStorage, try/catch) and seeds the query as already-stale
 * data: offline, the report prints with the last rates this device read from the server; online,
 * it refetches at once. A device that has never read the list offline gets `isError`, and the
 * report says so instead of printing a rate it does not have.
 */

export const RECORDING_FEE_RATES_QUERY_KEY = ['registry-recording-fee-rates'] as const;
const CACHE_STORAGE_KEY = 'myk9:registry-recording-fee-rates:v1';

interface RateRow {
  registry: string;
  effective_from: string;
  amount_cents: number;
}

// The generated database types are regenerated after the migration is pushed; until then the
// table is reached through this narrow shape (the same approach as paperwork_prints).
const ratesClient = supabase as unknown as {
  from(table: 'registry_recording_fee_rates'): {
    select(columns: string): Promise<{
      data: RateRow[] | null;
      error: { message: string } | null;
    }>;
  };
};

function isRate(value: unknown): value is RecordingFeeRate {
  if (typeof value !== 'object' || value === null) return false;
  const rate = value as Record<string, unknown>;
  return (
    typeof rate.registry === 'string' &&
    typeof rate.effectiveFrom === 'string' &&
    typeof rate.amountCents === 'number' &&
    Number.isInteger(rate.amountCents)
  );
}

function readCachedRates(): RecordingFeeRate[] | undefined {
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isRate) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedRates(rates: RecordingFeeRate[]): void {
  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // Storage can be blocked or full; the list is simply read again next time.
  }
}

export async function fetchRecordingFeeRates(): Promise<RecordingFeeRate[]> {
  const { data, error } = await ratesClient
    .from('registry_recording_fee_rates')
    .select('registry, effective_from, amount_cents');
  // Throw, never return []: an empty list is a real answer ("no rate is in force") and an
  // RLS or network failure must not be cached as one.
  if (error) throw new Error(error.message);
  const rates = (data ?? []).map((row): RecordingFeeRate => ({
    registry: row.registry,
    effectiveFrom: row.effective_from,
    amountCents: row.amount_cents,
  }));
  writeCachedRates(rates);
  return rates;
}

export function useRecordingFeeRates(enabled: boolean): UseQueryResult<RecordingFeeRate[]> {
  return useQuery({
    queryKey: RECORDING_FEE_RATES_QUERY_KEY,
    queryFn: fetchRecordingFeeRates,
    enabled,
    ...cacheStrategies.static,
    refetchOnMount: 'always',
    initialData: enabled ? readCachedRates : undefined,
    // Epoch: whatever this device cached is stale the moment it can be checked.
    initialDataUpdatedAt: 0,
  });
}

/** True once the rate read has an answer to print from, or has failed (so the report can say so). */
export function recordingFeeRatesSettled(query: UseQueryResult<RecordingFeeRate[]>): boolean {
  return query.data !== undefined || query.isError || query.fetchStatus === 'paused';
}

/**
 * The query as the report host hands it to a report: rates only when there is a list to read,
 * else `isError` (never an empty list standing in for "not read").
 */
export function recordingFeeRatesForReport(
  query: UseQueryResult<RecordingFeeRate[]>
): ReportAsyncData<RecordingFeeRate[]> {
  if (query.data !== undefined) return { data: query.data, isLoading: false, isError: false };
  const settledWithoutData = query.isError || query.fetchStatus === 'paused';
  return { data: [], isLoading: !settledWithoutData, isError: settledWithoutData };
}
