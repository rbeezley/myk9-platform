/**
 * Calendar dates as the secretary reads them on paper: "10/3/2026", never "2026-10-03".
 *
 * Takes the packet's own date text, which is either one ISO day or a range ("2026-10-03–2026-10-04"),
 * and rewrites each ISO day as M/D/YYYY, the same style as `formatReportDate` in the app. It works on
 * the digits, never through `new Date(...)`, so a calendar day cannot shift with the timezone.
 *
 * Display only: `page.context.trialDate` stays ISO because the print fingerprint and the per-day
 * packet identity hash it.
 *
 * No app-alias or workspace imports: this module is read verbatim by a Deno edge function.
 */
export function formatPacketDateText(text: string | null | undefined): string {
  return (text ?? '').replace(
    /(\d{4})-(\d{2})-(\d{2})/g,
    (_, year: string, month: string, day: string) => `${Number(month)}/${Number(day)}/${year}`
  );
}
