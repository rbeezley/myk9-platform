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
  /** The secretary's note to exhibitors (shows.confirmation_message), printed as written. */
  secretaryNote?: string | null;
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
 * The secretary's note to exhibitors (MYK9-1999): parking, crating, a late start. Renders ''
 * when there is none, so every template can interpolate it unconditionally. Neutral styling,
 * like the directions link, because it sits inside eight differently themed templates.
 */
export function renderSecretaryNoteBlock(note: string | null | undefined): string {
  const text = note?.trim();
  if (!text) return '';
  return `<div style="margin:16px 0 0;padding:12px 16px;border:1px solid #cfc8ba;border-radius:4px;font-size:14px;line-height:1.55;"><p style="margin:0 0 4px;font-weight:bold;">Note from the show secretary</p><p style="margin:0;">${escMultiline(text)}</p></div>`;
}
