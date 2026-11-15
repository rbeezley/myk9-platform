// The full confirmation, once per exhibitor per show (MYK9-1999). Deno-free so vitest can import it.
//
// An entry is confirmed when its entry is accepted and its armband exists: the
// auto_assign_armband_on_accept trigger gives the armband in the same write that accepts it
// (entry_status 'confirmed'). The scheduled send-confirmation-email run gathers every such entry
// that has not had its confirmation, on a published show that is not over, and sends ONE email
// per exhibitor per show listing them all. An entry accepted after her email went out is gathered
// by a later run and gets an email of its own.
//
// Why this is also the "Entry accepted" email: the secretary's accept and this confirmation fire
// at the same moment, so on a published show that is not over the app no longer sends its own
// accepted email (decisionEmail.ts, MYK9-1999); this one says it.
//
// Once only, per entry: an entry is claimed (confirmation_email_sent_at stamped) before the send,
// and only an unclaimed, still-confirmed entry can be claimed, so two overlapping runs cannot both
// send it. A failed send releases the claim as 'failed'; the daily run retries those. Resend's
// idempotency key is derived from the claimed ids, so a retry of a send that did go out is the
// same message, not a second one.
//
// The quiet period: an entry is gathered only once it has gone CONFIRMATION_QUIET_MS without a
// change, so an Accept the secretary undoes (or keeps editing) is not emailed.

import { formatVenueLines, myShowsUrl } from '../_shared/exhibitorEmailDetails.ts';
import type { HeritageEmailData, RunRow } from './heritage-email.ts';
import { registryEmailLanguage, type RegistryEmailLanguage } from './registryLanguage.ts';
import { buildTrialLabelMap } from './trialLabel.ts';
import { formatEntryFee } from './entryFee.ts';
import { buildVenueMapAssets } from './venue-directions.ts';
import { getPublishedExperienceHospitalityNotes } from './published-experience.ts';

/** How long an accepted entry must go unchanged before it is emailed. */
export const CONFIRMATION_QUIET_MS = 10 * 60 * 1000;
/** Exhibitors emailed per run; the rest wait for the next run. */
export const CONFIRMATION_MAX_EMAILS_PER_RUN = 50;
/** Candidate entries read per run. */
export const CONFIRMATION_ROW_LIMIT = 500;
/** A show is emailed while it is published and not over (same set as showSendsDecisionEmailsUnasked). */
export const CONFIRMATION_LIVE_SHOW_STATUSES = ['published', 'upcoming', 'in_progress'] as const;
const DEFAULT_TIME_ZONE = 'America/New_York';

export interface ConfirmationTrial {
  id: string;
  name: string | null;
  trial_number: string | null;
  display_order?: number | null;
  date: string | null;
  timezone: string | null;
  registry_id: string | null;
}

export interface ConfirmationShow {
  id: string;
  name: string;
  status: string | null;
  start_date: string;
  end_date: string;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  organization: string | null;
  confirmation_message: string | null;
  style?: string | null;
  brand_color?: string | null;
  experience_is_published?: boolean | null;
  experience_published_style?: string | null;
  experience_published_content?: {
    supplemental?: { hospitalityNotes?: string | null } | null;
  } | null;
  trials: ConfirmationTrial[];
}

export interface ConfirmationEntry {
  id: string;
  show_id: string;
  trial_id: string | null;
  class_id: string | null;
  registration_id: string | null;
  handler_id: string | null;
  dog_id: string | null;
  armband: string | null;
  entry_fee: number | null;
  /** 'pending' never tried, 'failed' tried before (the missing-address log is written once). */
  confirmation_email_status?: string | null;
  dog: {
    name: string | null;
    call_name: string | null;
    breed: string | null;
    sex: string | null;
  } | null;
  class: { name: string | null; level: string | null; element: string | null } | null;
}

export interface ConfirmationRecipient {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** One exhibitor's confirmation for one show. */
export interface ConfirmationGroup {
  key: string;
  showId: string;
  registrationId: string | null;
  handlerId: string | null;
  entries: ConfirmationEntry[];
}

export type ConfirmationScope = 'new' | 'all';

/** The calendar date (YYYY-MM-DD) in a time zone. */
function dateInZone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIME_ZONE }).format(now);
  }
}

/** The show's zone: its first trial's, by date then id, as getTrialTimezone reads one. */
export function showTimeZone(trials: readonly ConfirmationTrial[]): string {
  const [first] = [...trials].sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date == null) return 1;
      if (b.date == null) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  });
  const zone = first?.timezone?.trim();
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Published (or upcoming or under way) and not past its last day in its own time zone. */
export function showTakesConfirmations(show: ConfirmationShow, now: Date): boolean {
  if (!(CONFIRMATION_LIVE_SHOW_STATUSES as readonly string[]).includes(show.status ?? '')) {
    return false;
  }
  return show.end_date.slice(0, 10) >= dateInZone(now, showTimeZone(show.trials));
}

/** The show's registry (one per show): its trials' registry_id. */
export function showRegistry(show: ConfirmationShow): RegistryEmailLanguage {
  return registryEmailLanguage(show.trials.find(trial => trial.registry_id)?.registry_id ?? null);
}

/** One group per exhibitor per show: her registration, else the entry's handler. */
export function groupConfirmationsByExhibitor(entries: ConfirmationEntry[]): ConfirmationGroup[] {
  const groups = new Map<string, ConfirmationGroup>();
  for (const entry of entries) {
    const who = entry.registration_id
      ? `registration:${entry.registration_id}`
      : entry.handler_id
        ? `handler:${entry.handler_id}`
        : `entry:${entry.id}`;
    const key = `${entry.show_id}:${who}`;
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else
      groups.set(key, {
        key,
        showId: entry.show_id,
        registrationId: entry.registration_id,
        handlerId: entry.registration_id ? null : entry.handler_id,
        entries: [entry],
      });
  }
  return [...groups.values()];
}

/** Resend's idempotency key for one email: the show, the exhibitor and the entries it covers. */
export async function confirmationIdempotencyKey(
  group: Pick<ConfirmationGroup, 'key'>,
  entryIds: string[]
): Promise<string> {
  const data = new TextEncoder().encode(`${group.key}|${[...entryIds].sort().join(',')}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `entry-confirmation:${hex.slice(0, 48)}`;
}

function formatTrialDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(`${start.slice(0, 10)}T12:00:00Z`);
  const e = new Date(`${end.slice(0, 10)}T12:00:00Z`);
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  if (s.getTime() === e.getTime()) return `${s.getUTCDate()} ${month(s)} ${s.getUTCFullYear()}`;
  return s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()
    ? `${s.getUTCDate()} to ${e.getUTCDate()} ${month(s)} ${s.getUTCFullYear()}`
    : `${s.getUTCDate()} ${month(s)} to ${e.getUTCDate()} ${month(e)} ${e.getUTCFullYear()}`;
}

function dogLabel(entry: ConfirmationEntry): string {
  return entry.dog?.call_name?.trim() || entry.dog?.name?.trim() || 'Your dog';
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The subject: one entry or several, always naming the show. */
export function confirmationSubject(showName: string, entryCount: number): string {
  return entryCount === 1
    ? `Your entry to ${showName} is accepted`
    : `Your entries to ${showName} are accepted`;
}

/** What the email says, for the style builders. */
export function buildConfirmationEmailData(args: {
  show: ConfirmationShow;
  entries: ConfirmationEntry[];
  recipient: ConfirmationRecipient | null;
  judgeByClass: ReadonlyMap<string, string>;
  confirmationNumber: string | null;
  siteUrl: string | null | undefined;
}): HeritageEmailData {
  const { show, judgeByClass } = args;
  const registry = showRegistry(show);
  const numerals = buildTrialLabelMap(show.trials);
  const trialById = new Map(show.trials.map(trial => [trial.id, trial]));
  const dogs = [...new Map(args.entries.map(entry => [entry.dog_id ?? entry.id, entry])).values()];
  const severalDogs = dogs.length > 1;

  const keyed = args.entries.map(entry => {
    const trial = entry.trial_id ? trialById.get(entry.trial_id) : undefined;
    const classLabel =
      [entry.class?.level, entry.class?.element ?? entry.class?.name].filter(Boolean).join(' · ') ||
      'Class';
    const run: RunRow = {
      numeral: (entry.trial_id && numerals.get(entry.trial_id)) || 'Trial',
      dayLabel: formatTrialDay(trial?.date ?? null),
      classLabel: severalDogs ? `${dogLabel(entry)}: ${classLabel}` : classLabel,
      judgeName: (entry.class_id && judgeByClass.get(entry.class_id)) || 'To be announced',
      armband: entry.armband,
    };
    return { run, sortKey: `${trial?.date ?? ''}|${dogLabel(entry)}|${classLabel}` };
  });
  keyed.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  const runs = keyed.map(item => item.run);

  const venue = formatVenueLines(show);
  const only = severalDogs ? null : dogs[0];
  const totalFees = args.entries.reduce((sum, entry) => sum + Number(entry.entry_fee ?? 0), 0);
  const salutation =
    [args.recipient?.firstName, args.recipient?.lastName].filter(Boolean).join(' ') || 'Exhibitor';

  return {
    venueMap: buildVenueMapAssets(show.latitude, show.longitude, venue),
    // The org name is the real club identity; legacy rows without one fall back to the show name.
    clubName: show.organization ?? show.name,
    clubEstablished: null,
    clubCity: [show.city, show.state].filter(Boolean).join(', ') || null,
    showTitle: show.name,
    dateRange: formatDateRange(show.start_date, show.end_date),
    salutation,
    dogName: only
      ? only.dog?.name?.trim() || dogLabel(only)
      : joinNames(dogs.map(entry => dogLabel(entry))),
    dogCallName: only?.dog?.call_name ?? null,
    dogBreed: only?.dog?.breed ?? null,
    dogSex: only?.dog?.sex ?? null,
    runs,
    runCount: runs.length,
    totalFeesFormatted: formatEntryFee(totalFees),
    receiptNumber: args.confirmationNumber,
    venue,
    doorsTime: null,
    firstClassTime: null,
    parkingNotes: null,
    hospitalityNotes: getPublishedExperienceHospitalityNotes(show),
    cratingNotes: null,
    secretaryEmail: null,
    secretaryPhone: null,
    trialUrl: myShowsUrl(args.siteUrl),
    trialChairName: null,
    trialChairTitle: null,
    memberClubLanguage: registry.memberClubLanguage,
    registryShortName: registry.shortName,
    secretaryNote: show.confirmation_message,
  };
}
