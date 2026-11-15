// Shared confirmation email helpers for Deno edge builders.
//
// Keep this file free of workspace imports: Supabase edge functions deploy
// these files directly, outside the monorepo package graph.

export interface ConfirmationEmailRunRow {
  /** Production edge contract from send-confirmation-email/index.ts. */
  numeral: string;
  dayLabel: string;
  classLabel: string;
  judgeName: string;
  armband: string | null;
}

export interface VenueMapAssetsRef {
  linkUrl: string;
}

export interface ConfirmationEmailBaseData {
  /** Optional so preview-parity fixtures and older callers stay valid. */
  venueMap?: VenueMapAssetsRef | null;
  clubName: string;
  clubEstablished: string | null;
  clubCity: string | null;
  showTitle: string;
  dateRange: string;
  salutation: string;
  dogName: string;
  dogCallName: string | null;
  dogBreed: string | null;
  dogSex: string | null;
  runs: ConfirmationEmailRunRow[];
  runCount: number;
  totalFeesFormatted: string;
  receiptNumber: string | null;
  venue: string | null;
  doorsTime: string | null;
  firstClassTime: string | null;
  parkingNotes: string | null;
  hospitalityNotes: string | null;
  cratingNotes: string | null;
  secretaryEmail: string | null;
  secretaryPhone: string | null;
  trialUrl: string | null;
  trialChairName: string | null;
  trialChairTitle: string | null;
  memberClubLanguage: string;
  /** The show's Note to exhibitors (shows.confirmation_message), printed as written. MYK9-1999. */
  noteToExhibitors?: string | null;
  /** My Shows, where she always finds the current details. MYK9-1999. */
  myShowsUrl?: string | null;
}

export type OnTheDayFields = Pick<
  ConfirmationEmailBaseData,
  'doorsTime' | 'firstClassTime' | 'venue' | 'parkingNotes' | 'hospitalityNotes' | 'cratingNotes'
>;

export function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escMultiline(s: string | null | undefined): string {
  return esc(s).replace(/\n/g, '<br/>');
}

export function formatDogLine(
  data: Pick<ConfirmationEmailBaseData, 'dogCallName' | 'dogBreed' | 'dogSex'>,
  options: { callNameStyle: 'called' | 'quoted' }
): string {
  const callName =
    options.callNameStyle === 'called'
      ? data.dogCallName
        ? `called "${data.dogCallName}"`
        : null
      : data.dogCallName
        ? `"${data.dogCallName}"`
        : null;

  return [callName, data.dogBreed, data.dogSex].filter(Boolean).join(' · ');
}

export function formatRunCountLabel(runCount: number): string {
  return `${runCount} ${runCount === 1 ? 'run' : 'runs'}`;
}

export function hasOnTheDayDetails(data: OnTheDayFields): boolean {
  return !!(
    data.doorsTime ||
    data.firstClassTime ||
    data.venue ||
    data.parkingNotes ||
    data.hospitalityNotes ||
    data.cratingNotes
  );
}

/**
 * The secretary's Note to exhibitors and the My Shows link (MYK9-1999), as one table row with
 * neutral styling: it sits inside eight differently themed templates, like the directions link.
 * Renders '' when there is neither.
 */
export function renderExhibitorExtras(
  data: Pick<ConfirmationEmailBaseData, 'noteToExhibitors' | 'myShowsUrl'>
): string {
  const note = data.noteToExhibitors?.trim();
  const noteBlock = note
    ? `<div style="margin:0 0 16px;padding:14px 16px;border-left:4px solid #1a4fa0;background:#f2f5fb;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1a1612;"><p style="margin:0 0 4px;font-weight:bold;">Note from the show secretary</p><p style="margin:0;">${escMultiline(note)}</p></div>`
    : '';
  const linkBlock = data.myShowsUrl
    ? `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1a1612;">Your entries, armbands and the latest show details are always in My Shows.</p><p style="margin:10px 0 0;"><a href="${esc(data.myShowsUrl)}" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1a4fa0;text-decoration:underline;border:1px solid #cfc8ba;border-radius:4px;">Open My Shows</a></p>`
    : '';
  if (!noteBlock && !linkBlock) return '';
  return `<tr><td style="padding:16px 40px 24px;">${noteBlock}${linkBlock}</td></tr>`;
}

/** Every template marks its footer row with this comment; the extras go just above it. */
export const FOOTER_MARKER = '<!-- FOOTER';

/** The built email with the note and My Shows link above its footer. */
export function withExhibitorExtras(
  html: string,
  data: Pick<ConfirmationEmailBaseData, 'noteToExhibitors' | 'myShowsUrl'>
): string {
  const extras = renderExhibitorExtras(data);
  const at = html.indexOf(FOOTER_MARKER);
  if (!extras || at < 0) return html;
  return `${html.slice(0, at)}${extras}\n  ${html.slice(at)}`;
}
