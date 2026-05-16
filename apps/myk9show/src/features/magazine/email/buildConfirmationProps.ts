import { getRegistry } from '@/features/registries';
import { toLowerRoman } from '../landing/useMagazineLandingData';
import type { MagazineConfirmationProps, MagazineRunRow } from '@myk9/email';

// ─── Input types (mirror Supabase Row shapes) ────────────────────────────────

interface ShowInput {
  name: string;
  start_date: string;
  end_date: string;
  venue_name?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
}

interface TrialInput {
  id: string;
  date: string;
  trial_number?: string | null;
  display_order?: number | null;
  timezone?: string | null;
}

interface ClassInput {
  id: string;
  trial_id: string;
  name: string;
  level?: string | null;
  element?: string | null;
}

interface JudgeInput {
  trial_id: string;
  judgeName: string;
}

interface EntryInput {
  id: string;
  trial_id?: string | null;
  class_id?: string | null;
  armband?: string | null;
  entry_fee?: number | null;
}

interface DogInput {
  name: string;
  call_name?: string | null;
  breed?: string | null;
  sex?: string | null;
}

interface PersonInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface ClubInput {
  name: string;
  established?: string | null;
  city?: string | null;
  state?: string | null;
}

interface OfficerInput {
  role: string;
  name: string;
}

interface ShowSettingsInput {
  doorsTime?: string | null;
  firstClassTime?: string | null;
  parkingNotes?: string | null;
  hospitalityNotes?: string | null;
  cratingNotes?: string | null;
  secretaryEmail?: string | null;
  secretaryPhone?: string | null;
  trialUrl?: string | null;
  showSlug?: string | null;
  /** Optional sanctioning license reference for the footer fine print. */
  licenseReference?: string | null;
  /** Optional edition label override; falls back to "Edition · {year}". */
  editionLabel?: string | null;
}

export interface BuildMagazineConfirmationPropsOptions {
  show: ShowInput;
  /** All trials for the show, sorted by display_order. */
  allTrials: TrialInput[];
  allClasses: ClassInput[];
  judges: JudgeInput[];
  /** Entries for this exhibitor (one per class entered). */
  entries: EntryInput[];
  dog: DogInput;
  handler: PersonInput;
  club: ClubInput;
  officers?: OfficerInput[];
  settings?: ShowSettingsInput;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(endIso + 'T00:00:00');
  const startDay = start.getDate();
  const endDay = end.getDate();
  const month = start.toLocaleDateString('en-US', { month: 'long' });
  const year = start.getFullYear();
  if (start.getMonth() === end.getMonth()) {
    return `${startDay}–${endDay} ${month} ${year}`;
  }
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
  return `${startDay} ${month} – ${endDay} ${endMonth} ${year}`;
}

function formatTrialDay(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday} ${day} ${month}`;
}

function buildSalutation(handler: PersonInput): string {
  return [handler.first_name, handler.last_name].filter(Boolean).join(' ') || 'Exhibitor';
}

function buildVenueString(show: ShowInput): string | null {
  if (!show.venue_name) return null;
  const addressParts = [show.address, show.city, show.state].filter(Boolean).join(', ');
  return addressParts ? `${show.venue_name}\n${addressParts}` : show.venue_name;
}

function findTrialChair(
  officers?: OfficerInput[],
  clubName?: string
): { name: string | null; title: string | null } {
  const chair = officers?.find(o => /chair|president/i.test(o.role));
  return {
    name: chair?.name ?? null,
    title: chair ? `${chair.role}, ${clubName ?? ''}`.trim() : null,
  };
}

function derivePrimaryArmband(entries: EntryInput[]): string | null {
  const armbands = entries
    .map(e => e.armband)
    .filter((a): a is string => typeof a === 'string' && a.length > 0);
  if (!armbands.length) return null;
  const first = armbands[0];
  const allSame = armbands.every(a => a === first);
  return allSame ? first : null;
}

/**
 * Build `MagazineConfirmationProps` from the same database inputs that
 * Heritage's `buildConfirmationProps` reads. Shape parity matters: the
 * dispatch layer (see the PR description's Phase 3 wiring instructions)
 * will route between Heritage and Magazine off the same row data.
 *
 * Notable transformations specific to Magazine:
 *  - `trialNumeral` is rendered in **lowercase Roman** ("i", "iii") rather
 *    than uppercase — matches the editorial voice
 *  - `primaryArmband` is derived from the entries: when all share one
 *    armband (typical AKC scent work), it's displayed in the armband
 *    callout row; mixed armbands fall back to a run-count message
 *  - `editionLabel` defaults to "Edition · {year}" but accepts an override
 *    from `settings.editionLabel` for clubs that want a custom strip
 */
export function buildMagazineConfirmationProps(
  opts: BuildMagazineConfirmationPropsOptions
): MagazineConfirmationProps {
  const { show, allTrials, allClasses, judges, entries, dog, handler, club, officers, settings } =
    opts;
  const registry = getRegistry('AKC');

  const sortedTrials = [...allTrials].sort(
    (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)
  );
  const trialNumeralMap = new Map(
    sortedTrials.map((t, i) => [t.id, t.trial_number ?? toLowerRoman(i + 1)])
  );

  const runs: MagazineRunRow[] = entries
    .map(entry => {
      const trial = allTrials.find(t => t.id === entry.trial_id);
      const cls = allClasses.find(c => c.id === entry.class_id);
      const judge = judges.find(j => j.trial_id === entry.trial_id);
      const classLabel = cls
        ? [cls.level, cls.element ?? cls.name].filter(Boolean).join(' · ')
        : '—';
      const rawNumeral = trial ? trialNumeralMap.get(trial.id) ?? '—' : '—';
      // Force lowercase for the editorial voice — even if trial_number was
      // stored uppercase, the magazine renders lowercase Roman numerals.
      const numeral =
        rawNumeral && rawNumeral !== '—' ? toLowerRoman(parseInt(rawNumeral, 10) || rawNumeral) : '—';
      return {
        trialNumeral: numeral === '—' ? rawNumeral.toLowerCase() : numeral,
        dayLabel: trial ? formatTrialDay(trial.date) : '—',
        classLabel,
        judgeName: judge?.judgeName ?? '—',
        armband: entry.armband ?? null,
        _displayOrder: trial?.display_order ?? 999,
      };
    })
    .sort((a, b) => a._displayOrder - b._displayOrder)
    .map(({ _displayOrder: _d, ...row }) => row);

  const totalCents = entries.reduce((sum, e) => sum + (e.entry_fee ?? 0), 0);
  const totalFeesFormatted =
    totalCents > 0 ? `$${(totalCents / 100).toFixed(2)}` : `$${entries.length * 25}.00`;

  const trialChair = findTrialChair(officers, club.name);
  const venueStr = buildVenueString(show);
  const startYear = show.start_date ? new Date(show.start_date + 'T00:00:00').getFullYear() : null;
  const editionLabel =
    settings?.editionLabel ?? (startYear ? `Edition · ${startYear}` : 'Edition');

  return {
    clubName: club.name,
    clubEstablished: club.established ?? null,
    clubCity: [club.city, club.state].filter(Boolean).join(', ') || null,
    showTitle: show.name,
    dateRange: formatDateRange(show.start_date, show.end_date),
    editionLabel,
    salutation: buildSalutation(handler),
    dogRegisteredName: dog.name,
    dogCallName: dog.call_name ?? null,
    dogBreed: dog.breed ?? null,
    dogSex: dog.sex ?? null,
    runs,
    runCount: runs.length,
    totalFeesFormatted,
    receiptNumber: null,
    primaryArmband: derivePrimaryArmband(entries),
    doorsTime: settings?.doorsTime ?? null,
    firstClassTime: settings?.firstClassTime ?? null,
    venueNameAndAddress: venueStr,
    parkingNotes: settings?.parkingNotes ?? null,
    hospitalityNotes: settings?.hospitalityNotes ?? null,
    cratingNotes: settings?.cratingNotes ?? null,
    secretaryEmail: settings?.secretaryEmail ?? null,
    secretaryPhone: settings?.secretaryPhone ?? null,
    trialUrl: settings?.trialUrl ?? null,
    trialChairName: trialChair.name,
    trialChairTitle: trialChair.title,
    memberClubLanguage: registry.memberClubLanguage,
    showSlug: settings?.showSlug ?? null,
    licenseReference: settings?.licenseReference ?? null,
  };
}
