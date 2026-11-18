/**
 * MYK9-2044: the New Year show the report and the premium both price.
 *
 * A show that starts on the last day of the $4.50 year with a trial on the first day of the $5.50
 * year. The premium test (src/features/premium/__tests__/premiumRecordingFee.test.tsx) and the
 * Trial Secretary Report test (akcTrialSecretaryReportPolicy.test.ts) both price these dates, so
 * the premium's statement and the report's bill are checked against the same calendar.
 */
export const NEW_YEAR_SHOW = {
  startDate: '2026-12-31',
  trialDates: ['2026-12-31', '2027-01-01'],
} as const;
