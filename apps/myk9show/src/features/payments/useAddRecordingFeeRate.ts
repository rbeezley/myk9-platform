import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toCalendarDate, type RecordingFeeRate } from '@myk9/core';
import { supabase } from '@/lib/supabase';
import { RECORDING_FEE_RATES_QUERY_KEY } from '@/hooks/queries/useRecordingFeeRates';

/** Registries the table accepts (CHECK in migration 20261119031700). */
export const RECORDING_FEE_REGISTRIES = ['AKC', 'UKC', 'ASCA'] as const;
export type RecordingFeeRegistry = (typeof RECORDING_FEE_REGISTRIES)[number];

/** Mirrors the amount CHECK on the table: whole cents, $0.01 to $1,000.00 (never free). */
export const MAX_RECORDING_FEE_CENTS = 100_000;

/** A typo guard, not a rule the table enforces: an effective date outside these years is refused. */
export const MIN_RECORDING_FEE_YEAR = 2020;
export const MAX_RECORDING_FEE_YEAR = 2100;

/** True for a real `YYYY-MM-DD` calendar date whose year is in the accepted range. */
export function isPlausibleRecordingFeeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || toCalendarDate(value) !== value) return false;
  const year = Number(value.slice(0, 4));
  return year >= MIN_RECORDING_FEE_YEAR && year <= MAX_RECORDING_FEE_YEAR;
}

/** Postgres unique_violation: the (registry, effective_from) pair is already a row. */
export const DUPLICATE_RECORDING_FEE_CODE = '23505';

/**
 * Dollars as typed ("5.50", "5") to integer cents, or null when it is not a whole-cent amount
 * in range. Parsed from the text, never through a float multiply, so 4.35 is 435 not 434.
 */
export function parseRecordingFeeDollars(value: string): number | null {
  const match = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents > 0 && cents <= MAX_RECORDING_FEE_CENTS ? cents : null;
}

export interface NewRecordingFeeRate {
  registry: RecordingFeeRegistry;
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  amountCents: number;
}

// Reached through a narrow shape until the generated types are refreshed after the push.
const ratesClient = supabase as unknown as {
  from(table: 'registry_recording_fee_rates'): {
    insert(row: {
      registry: string;
      effective_from: string;
      amount_cents: number;
    }): Promise<{ error: { code?: string; message: string } | null }>;
  };
};

/**
 * Add one dated rate. Site-admin only: RLS on the table rejects anyone else, and this hook
 * renders behind the SITE_ADMIN route guard. Past rows are never edited or deleted here.
 */
export function useAddRecordingFeeRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rate: NewRecordingFeeRate): Promise<RecordingFeeRate> => {
      if (!isPlausibleRecordingFeeDate(rate.effectiveFrom)) {
        throw new Error(
          `Enter a valid effective date between ${MIN_RECORDING_FEE_YEAR} and ${MAX_RECORDING_FEE_YEAR}.`
        );
      }
      if (
        !Number.isInteger(rate.amountCents) ||
        rate.amountCents <= 0 ||
        rate.amountCents > MAX_RECORDING_FEE_CENTS
      ) {
        throw new Error('Enter a per-entry amount between $0.01 and $1,000.00.');
      }
      const { error } = await ratesClient.from('registry_recording_fee_rates').insert({
        registry: rate.registry,
        effective_from: rate.effectiveFrom,
        amount_cents: rate.amountCents,
      });
      if (error) {
        const failure = new Error(error.message) as Error & { code?: string };
        if (error.code) failure.code = error.code;
        throw failure;
      }
      return rate;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RECORDING_FEE_RATES_QUERY_KEY });
    },
  });
}
