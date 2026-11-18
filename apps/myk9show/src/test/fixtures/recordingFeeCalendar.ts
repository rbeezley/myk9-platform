/**
 * MYK9-2044: the New Year show both the app and the generate-premium edge tests price.
 * No imports, so the edge tests (tsconfig.edge-tests.json) can read it without pulling in app
 * modules.
 *
 * A show that starts on the last day of the $4.50 year with a trial on the first day of the $5.50
 * year. The premium test (supabase/functions/generate-premium/recordingFeeRate.test.ts) and the
 * Trial Secretary Report test (akcTrialSecretaryReportPolicy.test.ts) both price these dates, so
 * the premium's statement and the report's bill are checked against the same calendar.
 */
export const NEW_YEAR_SHOW = {
  startDate: '2026-12-31',
  trialDates: ['2026-12-31', '2027-01-01'],
} as const;
