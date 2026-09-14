/**
 * Builds the "Mon D, YYYY" string a receipt date should render as, WITHOUT
 * calling `formatPaymentDate` or `Intl.DateTimeFormat` — the two things the
 * production code under test uses to build the same string. A test that
 * pins an instant and asserts it against `formatPaymentDate(sameInstant)` is
 * tautological: it passes even if the formatter itself has a day-shift bug,
 * because both sides of the assertion run through the identical broken code.
 *
 * This helper reads the LOCAL-time calendar fields off the same pinned
 * instant with plain `Date` getters (`getFullYear`/`getMonth`/`getDate`),
 * which is exactly what `formatPaymentDate`'s `toLocaleDateString` resolves
 * to internally for the `en-US` locale — but does the month-name lookup with
 * a hard-coded table instead of `Intl`, so this helper and the code under
 * test share no formatting machinery at all.
 */
const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function expectedLocalDate(iso: string): string {
  const d = new Date(iso);
  const month = MONTH_ABBREVIATIONS[d.getMonth()];
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}
