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

export interface ConfirmationEmailBaseData {
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
