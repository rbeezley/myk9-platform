/**
 * The premium list's one list of facts (MYK9-1952, docs/plan-premium-completeness.md).
 *
 * Every premium style (PDF cover and body, and the public page's supplemental slice) reads
 * its facts from here, formatted once. A style decides how to ARRANGE a fact (labels,
 * separators, columns, which section it sits in); it does not compute or reword one. A fact
 * the registry requires is a fact no style may drop: add it to {@link PREMIUM_FACT_CATALOG}
 * and to {@link PremiumFacts}, and every style picks it up from the one place.
 *
 * Deliberately free of `@react-pdf/renderer` and font side effects: the public landing pages
 * import this module and must not pull the PDF runtime into the entry chunk.
 */
import type { RegistryId } from '@/features/registries';
import { formatLongDate } from '@/lib/format/dates';
import type { GeneratedPremium, PremiumSupplemental } from '@/types/premium-types';
import { makeClassComparator } from './pdf/bodies/classOrder';

/** Placeholder a style prints where a fact the secretary must supply is still empty. */
export const REQUIRED_PLACEHOLDER = '[REQUIRED — add before submitting]';

// ─── Catalog: what each fact is, where it comes from, who requires it ───────────────────

export type PremiumFactId =
  | 'clubName'
  | 'venue'
  | 'dates'
  | 'eventNumber'
  | 'showHours'
  | 'trialInformation'
  | 'fees'
  | 'classes'
  | 'judges'
  | 'secretary'
  | 'chair'
  | 'entryWindow'
  | 'vetClinic'
  | 'accommodations'
  | 'hospitality'
  | 'awards'
  | 'additionalNotes';

export type PremiumFactSource = 'club' | 'show' | 'trial' | 'class' | 'person' | 'template';

export interface PremiumFactDefinition {
  id: PremiumFactId;
  label: string;
  /** Where the value is entered or read from today. */
  source: PremiumFactSource;
  /** Registries whose rules require the fact in a premium list (AKC Ch. 3 §15 for AKC). */
  requiredBy: readonly RegistryId[];
}

export const PREMIUM_FACT_CATALOG: readonly PremiumFactDefinition[] = [
  { id: 'clubName', label: 'Name of club', source: 'club', requiredBy: ['AKC'] },
  { id: 'venue', label: 'Location', source: 'show', requiredBy: ['AKC'] },
  { id: 'dates', label: 'Date of the event', source: 'show', requiredBy: ['AKC'] },
  { id: 'eventNumber', label: 'Event number', source: 'trial', requiredBy: ['AKC'] },
  { id: 'showHours', label: 'Trial hours', source: 'show', requiredBy: ['AKC'] },
  { id: 'trialInformation', label: 'Trial information', source: 'show', requiredBy: [] },
  { id: 'fees', label: 'Entry fees', source: 'show', requiredBy: ['AKC'] },
  { id: 'classes', label: 'Classes offered', source: 'class', requiredBy: ['AKC'] },
  { id: 'judges', label: 'Judges', source: 'person', requiredBy: ['AKC'] },
  { id: 'secretary', label: 'Trial Secretary', source: 'person', requiredBy: ['AKC'] },
  { id: 'chair', label: 'Trial Chair', source: 'person', requiredBy: ['AKC'] },
  { id: 'entryWindow', label: 'Entries open and close', source: 'show', requiredBy: ['AKC'] },
  { id: 'vetClinic', label: 'Veterinary services', source: 'template', requiredBy: [] },
  { id: 'accommodations', label: 'Accommodations', source: 'template', requiredBy: [] },
  { id: 'hospitality', label: 'Hospitality', source: 'template', requiredBy: [] },
  { id: 'awards', label: 'Awards', source: 'template', requiredBy: [] },
  { id: 'additionalNotes', label: 'Additional information', source: 'template', requiredBy: [] },
];

// ─── Formatting every style shares ──────────────────────────────────────────────────────

export function formatPremiumDate(d: string): string {
  return formatLongDate(d) || d;
}

// Format common US phone shapes; pass through anything else unchanged so we
// don't mangle international numbers or pre-formatted input.
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

// Build a typographic monogram from a club name. Strips honorifics + trailing
// numerals + corporate suffixes, then takes the first letter of each remaining
// word. Capped at 3 letters because anything longer reads as an acronym, not a
// monogram. Falls back to the first non-empty character if no clean letters
// can be extracted.
// Keep brand-defining words like "Club", "Kennel", "Association" — for dog
// clubs they're part of the identity, not filler. Only strip articles + legal
// suffixes that almost never belong in a monogram.
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  '&',
  'inc',
  'inc.',
  'llc',
  'llc.',
  'company',
  'co',
  'co.',
]);

export function buildMonogram(name: string | null | undefined): string {
  if (!name) return '';
  const words = name
    .replace(/[^A-Za-z &]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !STOPWORDS.has(w.toLowerCase()));
  if (words.length === 0) {
    const fallback = (name.match(/[A-Za-z]/) ?? [''])[0];
    return fallback.toUpperCase();
  }
  return words
    .slice(0, 3)
    .map(w => w[0]!.toUpperCase())
    .join('');
}

// ─── The supplemental slice (club template content), shared with the public page ────────

export interface SupplementalFacts {
  vetClinic: PremiumSupplemental['vetClinic'];
  accommodations: PremiumSupplemental['accommodations'];
  coverImageUrl: string | null;
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  additionalNotes: string | null;
}

/** One normalisation of the template-sourced facts, for the PDF and the public landing alike. */
export function pickSupplementalFacts(
  supplemental: Partial<PremiumSupplemental> | null | undefined
): SupplementalFacts {
  return {
    vetClinic: supplemental?.vetClinic ?? null,
    accommodations: supplemental?.accommodations ?? [],
    coverImageUrl: supplemental?.coverImageUrl ?? null,
    hospitalityNotes: supplemental?.hospitalityNotes ?? null,
    awardsDescription: supplemental?.awardsDescription ?? null,
    additionalNotes: supplemental?.additionalNotes ?? null,
  };
}

// ─── The list of facts ──────────────────────────────────────────────────────────────────

export interface PremiumContact {
  name: string;
  email: string | null;
  /** Display-formatted; empty string when there is none. */
  phone: string;
}

export interface PremiumTrialFacts {
  name: string;
  /** Long display date. */
  date: string;
  startTime: string | null;
  eventNumber: string | null;
  judges: Array<{ name: string; elements: string[] }>;
  /** "Element Level Section" in the registry's progression order. */
  classLabels: string[];
}

export interface PremiumFacts {
  org: GeneratedPremium['org'];
  style: GeneratedPremium['style'];
  showName: string;
  /** "Jun 1, 2026" or "Jun 1, 2026 – Jun 2, 2026". */
  dateRange: string;
  /** Raw club name, null when the show has none. */
  clubName: string | null;
  /** Club name for display, "Host Club" when unset. */
  club: string;
  monogram: string;
  /** Venue text, '' when unset. */
  venue: string;
  startDate: string;
  fees: {
    preEntry: number | null;
    dayOf: number | null;
    hasAny: boolean;
    /** "Checks", "Cash" in that order, only those the show accepts. */
    paymentMethods: string[];
  };
  entry: {
    /** Long display dates, null when unset. */
    opens: string | null;
    closes: string | null;
  };
  secretary: {
    name: string | null;
    email: string | null;
    phone: string;
    mailingAddress: string | null;
  };
  chair: PremiumContact | null;
  trials: PremiumTrialFacts[];
  vetClinic: { name: string; address: string; phone: string } | null;
  accommodations: Array<{ name: string; address: string; phone: string }>;
  coverImageUrl: string | null;
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  additionalNotes: string | null;
  showHours: string;
  trialInformation: string;
}

/**
 * Build the list of facts for a premium. `registry` picks the class progression order and
 * defaults to the premium's own org.
 */
export function buildPremiumFacts(
  data: GeneratedPremium,
  registry: RegistryId = (data.org ?? 'AKC') as RegistryId
): PremiumFacts {
  const comparator = makeClassComparator(registry);
  const { show, club, secretary, officials, narratives } = data;
  const supplemental = pickSupplementalFacts(data.supplemental);
  const dateRange =
    show.endDate && show.endDate !== show.startDate
      ? `${formatPremiumDate(show.startDate)} – ${formatPremiumDate(show.endDate)}`
      : formatPremiumDate(show.startDate);

  return {
    org: data.org,
    style: data.style,
    showName: show.name,
    dateRange,
    clubName: club.name,
    club: club.name ?? 'Host Club',
    monogram: buildMonogram(club.name ?? 'Host Club'),
    venue: show.venue ?? '',
    startDate: show.startDate,
    fees: {
      preEntry: show.preEntryFee,
      dayOf: show.dayOfFee,
      hasAny: (show.preEntryFee ?? 0) > 0 || (show.dayOfFee ?? 0) > 0,
      paymentMethods: [show.acceptChecks && 'Checks', show.acceptCash && 'Cash'].filter(
        (m): m is string => Boolean(m)
      ),
    },
    entry: {
      opens: show.entryOpenDate ? formatPremiumDate(show.entryOpenDate) : null,
      closes: show.entryCloseDate ? formatPremiumDate(show.entryCloseDate) : null,
    },
    secretary: {
      name: secretary.name,
      email: secretary.email,
      phone: formatPhone(secretary.phone),
      mailingAddress: secretary.mailingAddress,
    },
    chair: officials.chairman
      ? {
          name: officials.chairman.name,
          email: officials.chairman.email,
          phone: formatPhone(officials.chairman.phone),
        }
      : null,
    trials: (data.trials ?? []).map(trial => ({
      name: trial.name,
      date: formatPremiumDate(trial.date),
      startTime: trial.startTime,
      eventNumber: trial.eventNumber,
      judges: (trial.judges ?? []).map(j => ({ name: j.name, elements: j.elements ?? [] })),
      classLabels: [...(trial.classes ?? [])]
        .sort(comparator)
        .map(c => `${c.element} ${c.level}${c.section ? ` ${c.section}` : ''}`),
    })),
    vetClinic: supplemental.vetClinic
      ? { ...supplemental.vetClinic, phone: formatPhone(supplemental.vetClinic.phone) }
      : null,
    accommodations: supplemental.accommodations.map(a => ({
      ...a,
      phone: formatPhone(a.phone),
    })),
    coverImageUrl: supplemental.coverImageUrl,
    hospitalityNotes: supplemental.hospitalityNotes,
    awardsDescription: supplemental.awardsDescription,
    additionalNotes: supplemental.additionalNotes,
    showHours: narratives?.showHours ?? '',
    trialInformation: narratives?.trialInformation ?? '',
  };
}
