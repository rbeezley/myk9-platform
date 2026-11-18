import type { RecordingFeeRate } from '@myk9/core';
import type { ReportAsyncData } from '@/lib/reports/types';

/** The AKC rows migration 20261119031700 seeds (AKC Secretary's Page, Sept 2025, p. 28). */
export const SEEDED_AKC_RECORDING_FEE_RATES: RecordingFeeRate[] = [
  { registry: 'AKC', effectiveFrom: '2025-01-01', amountCents: 350 },
  { registry: 'AKC', effectiveFrom: '2026-01-01', amountCents: 450 },
  { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
];

/** The rate list as the report host hands it to a report once it has been read. */
export const SEEDED_RECORDING_FEE_RATES_READ: ReportAsyncData<RecordingFeeRate[]> = {
  data: SEEDED_AKC_RECORDING_FEE_RATES,
  isLoading: false,
  isError: false,
};
