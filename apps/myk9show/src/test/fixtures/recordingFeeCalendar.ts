/**
 * MYK9-2044: the recording fee dates both the app and the generate-premium edge tests price.
 * No imports, so the edge tests (tsconfig.edge-tests.json) can read it without pulling in app
 * modules.
 */

/** The AKC rows migration 20261119031700 seeds (AKC Secretary's Page, Sept 2025, p. 28). */
export const SEEDED_AKC_RECORDING_FEE_ROWS = [
  { registry: 'AKC', effectiveFrom: '2025-01-01', amountCents: 350 },
  { registry: 'AKC', effectiveFrom: '2026-01-01', amountCents: 450 },
  { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
] as const;

/**
 * A show that starts on the last day of the $4.50 year with a trial on the first day of the $5.50
 * year. The premium test (supabase/functions/generate-premium/recordingFeeRate.test.ts) and the
 * Trial Secretary Report test (akcTrialSecretaryReportPolicy.test.ts) both price these dates, so
 * the premium's statement and the report's bill are checked against the same calendar.
 */
export const NEW_YEAR_SHOW = {
  startDate: '2026-12-31',
  trialDates: ['2026-12-31', '2027-01-01'],
} as const;
