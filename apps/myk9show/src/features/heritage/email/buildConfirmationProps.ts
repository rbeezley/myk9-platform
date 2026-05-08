import { getRegistry } from '@/features/registries';
import { toRoman } from '@/features/heritage/landing/useHeritageLandingData';
import type { HeritageConfirmationProps, HeritageRunRow } from '@myk9/email';

// ─── Input types (mirrors Supabase Row shapes we care about) ─────────────────

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
}

export interface BuildConfirmationPropsOptions {
  show: ShowInput;
  /** All trials for the show, sorted by display_order. */
  allTrials: TrialInput[];
  allClasses: ClassInput[];
  judges: JudgeInput[];
  /** The entries for this specific exhibitor (one per class entered). */
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

// ─── Salutation ───────────────────────────────────────────────────────────────
// Use handler's full name without prefix — the email template renders "Dear [salutation],"
// and the handoff uses "Ms. Patricia Holloway". We don't store title/prefix in the DB,
// so we emit the full name and let the secretary personalize if desired.

function buildSalutation(handler: PersonInput): string {
  return [handler.first_name, handler.last_name].filter(Boolean).join(' ') || 'Exhibitor';
}

// ─── Venue ────────────────────────────────────────────────────────────────────

function buildVenueString(show: ShowInput): string | null {
  if (!show.venue_name) return null;
  const addressParts = [show.address, show.city, show.state].filter(Boolean).join(', ');
  return addressParts ? `${show.venue_name}\n${addressParts}` : show.venue_name;
}

// ─── Trial chair ──────────────────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildConfirmationProps(
  opts: BuildConfirmationPropsOptions
): HeritageConfirmationProps {
  const { show, allTrials, allClasses, judges, entries, dog, handler, club, officers, settings } =
    opts;
  const registry = getRegistry('AKC');

  // Build sorted trial numeral map
  const sortedTrials = [...allTrials].sort(
    (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)
  );
  const trialNumeralMap = new Map(
    sortedTrials.map((t, i) => [t.id, t.trial_number ?? toRoman(i + 1)])
  );

  // Build run rows — one per entry, sorted by trial display_order
  const runs: HeritageRunRow[] = entries
    .map(entry => {
      const trial = allTrials.find(t => t.id === entry.trial_id);
      const cls = allClasses.find(c => c.id === entry.class_id);
      const judge = judges.find(j => j.trial_id === entry.trial_id);
      const classLabel = cls
        ? [cls.level, cls.element ?? cls.name].filter(Boolean).join(' · ')
        : '—';
      return {
        trialNumeral: trial ? (trialNumeralMap.get(trial.id) ?? '—') : '—',
        dayLabel: trial ? formatTrialDay(trial.date) : '—',
        classLabel,
        judgeName: judge?.judgeName ?? '—',
        armband: entry.armband ?? null,
        _displayOrder: trial?.display_order ?? 999,
      };
    })
    .sort((a, b) => a._displayOrder - b._displayOrder)
    .map(({ _displayOrder: _d, ...row }) => row);

  // Total fees
  const totalCents = entries.reduce((sum, e) => sum + (e.entry_fee ?? 0), 0);
  const totalFeesFormatted =
    totalCents > 0 ? `$${(totalCents / 100).toFixed(2)}` : `$${entries.length * 25}.00`; // fallback: $25/entry

  const trialChair = findTrialChair(officers, club.name);

  const venueStr = buildVenueString(show);

  return {
    clubName: club.name,
    clubEstablished: club.established ?? null,
    clubCity: [club.city, club.state].filter(Boolean).join(', ') || null,
    showTitle: show.name,
    dateRange: formatDateRange(show.start_date, show.end_date),
    salutation: buildSalutation(handler),
    dogRegisteredName: dog.name,
    dogCallName: dog.call_name ?? null,
    dogBreed: dog.breed ?? null,
    dogSex: dog.sex ?? null,
    runs,
    runCount: runs.length,
    totalFeesFormatted,
    receiptNumber: null,
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
  };
}
