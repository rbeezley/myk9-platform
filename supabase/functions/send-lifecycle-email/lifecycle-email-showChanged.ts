import { formatVenueLines } from '../_shared/exhibitorEmailDetails.ts';
import { myShowsEntriesUrl } from './lifecycle-email-shared.ts';

/**
 * The "show changed" email (MYK9-2124): rendered when it is SENT, from the show's current
 * dates and venue, so a job that waited out several edits carries the latest values.
 */

export interface ShowChangedTrial {
  name: string | null;
  /** YYYY-MM-DD, as stored. */
  date: string | null;
  deleted_at?: string | null;
}

export interface ShowChangedShow {
  id: string;
  name: string | null;
  status: string | null;
  deleted_at?: string | null;
  venue_name: string | null;
  /** The address the show wizard saves; the separate columns are the fallback. */
  location?: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  trials?: ShowChangedTrial[] | null;
}

/** The statuses that count as published, the same set the confirmation email uses. */
const PUBLISHED_SHOW_STATUSES = ['published', 'upcoming', 'in_progress'];

export function isPublishedShow(show: Pick<ShowChangedShow, 'status' | 'deleted_at'>): boolean {
  if (show.deleted_at) return false;
  return PUBLISHED_SHOW_STATUSES.includes((show.status ?? '').toLowerCase());
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Saturday, November 21, 2026" from a stored YYYY-MM-DD, with no time zone to shift it. */
export function formatTrialDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${MONTHS[month - 1]} ${day}, ${year}`;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function dateLines(show: ShowChangedShow): string[] {
  const trials = (show.trials ?? [])
    .filter(trial => !trial.deleted_at && clean(trial.date))
    .sort((a, b) => clean(a.date).localeCompare(clean(b.date)));
  if (trials.length === 0) return [];
  if (trials.length === 1) return [formatTrialDate(clean(trials[0].date))];
  return trials.map(trial => {
    const label = clean(trial.name);
    const date = formatTrialDate(clean(trial.date));
    return label ? `${label}: ${date}` : date;
  });
}

export interface RenderedShowChangedEmail {
  subject: string;
  body: string;
}

export function renderShowChangedEmail(args: {
  show: ShowChangedShow;
  recipientName: string | null;
}): RenderedShowChangedEmail {
  const showName = clean(args.show.name) || 'your show';
  const firstName = clean(args.recipientName).split(/\s+/)[0] || 'there';
  const dates = dateLines(args.show);
  const venue = formatVenueLines(args.show);

  const sections = [
    `Hi ${firstName},`,
    `The date or venue for ${showName} has changed. Here is what it is now.`,
  ];
  if (dates.length > 0)
    sections.push(`${dates.length === 1 ? 'Date' : 'Dates'}:\n${dates.join('\n')}`);
  if (venue) sections.push(`Venue:\n${venue}`);
  sections.push(
    `Your entries: ${myShowsEntriesUrl(args.show.id)}`,
    'Please contact the show secretary with questions.'
  );

  return { subject: `Update to ${showName}`, body: sections.join('\n\n') };
}
