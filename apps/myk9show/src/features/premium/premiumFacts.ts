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
import { stripPlaceholderNarrative } from './premiumNarratives';
import { formatPremiumClassLabel } from './premiumClassLabel';
import {
  OFFICER_POSITION_LABELS,
  OFFICER_POSITION_ORDER,
  type OfficerPosition,
} from '@/types/club-membership-types';
import {
  getPremiumRequiredStatement,
  getPremiumScoutingStatement,
  type RegistryId,
} from '@/features/registries';
import { resolveEffectiveWithdrawalTerms } from '@/features/payments/effectiveWithdrawalTerms';
import { buildWithdrawalDisclosure } from '@/features/payments/withdrawalPolicyText';
import { formatLongDate } from '@/lib/format/dates';
import type { GeneratedPremium, PremiumSupplemental } from '@/types/premium-types';
import { makeClassComparator } from './pdf/bodies/classOrder';
import { premiumRecordingFeeText } from './premiumRecordingFeeStatement';
import { premiumEntryLimitText } from './premiumEntryLimit';
import {
  premiumClassFeeLines,
  premiumEntryRuleLines,
  premiumTrialEntryLimitText,
  premiumVenueText,
} from './premiumEntryTerms';

// ─── Catalog: what each fact is, where it comes from, who requires it ───────────────────

export type PremiumFactId =
  | 'clubName'
  | 'venue'
  | 'dates'
  | 'eventNumber'
  | 'showHours'
  | 'trialInformation'
  | 'fees'
  | 'withdrawalPolicy'
  | 'scoutingStatement'
  | 'recordingFee'
  | 'classes'
  | 'judges'
  | 'secretary'
  | 'secretaryAddress'
  | 'officers'
  | 'committee'
  | 'chair'
  | 'chairAddress'
  | 'entryWindow'
  | 'vetClinic'
  | 'accommodations'
  | 'hospitality'
  | 'awards'
  | 'additionalNotes';

export type PremiumFactSource =
  'club' | 'show' | 'trial' | 'class' | 'person' | 'template' | 'registry';

export interface PremiumFactDefinition {
  id: PremiumFactId;
  label: string;
  /** Where the value is entered or read from today. */
  source: PremiumFactSource;
  /** Registries whose rules require the fact in a premium list (AKC Ch. 3 §15 for AKC). */
  requiredBy: readonly RegistryId[];
  /** Registries that need at least this many entries of a list fact (AKC: five committee names). */
  minimumBy?: Partial<Record<RegistryId, number>>;
}

/** AKC Ch. 3 §15: an Event Committee of at least five, including the Chair. */
export const AKC_EVENT_COMMITTEE_MINIMUM = 5;

export const PREMIUM_FACT_CATALOG: readonly PremiumFactDefinition[] = [
  { id: 'clubName', label: 'Name of club', source: 'club', requiredBy: ['AKC', 'ASCA'] },
  { id: 'venue', label: 'Location', source: 'show', requiredBy: ['AKC', 'ASCA'] },
  { id: 'dates', label: 'Date of the event', source: 'show', requiredBy: ['AKC', 'ASCA'] },
  { id: 'eventNumber', label: 'Event number', source: 'trial', requiredBy: ['AKC'] },
  { id: 'showHours', label: 'Trial hours', source: 'show', requiredBy: ['AKC', 'ASCA'] },
  { id: 'trialInformation', label: 'Trial information', source: 'show', requiredBy: [] },
  { id: 'fees', label: 'Entry fees', source: 'show', requiredBy: ['AKC', 'ASCA'] },
  // MYK9-1976: the club's text (a show may override it), else the registry-correct default.
  {
    id: 'withdrawalPolicy',
    label: 'Withdrawals and Pulls',
    source: 'club',
    requiredBy: ['AKC', 'ASCA'],
  },
  // MYK9-2043: the registry's own words (AKC Ch. 3 §15); the club types nothing.
  {
    id: 'scoutingStatement',
    label: 'Scouting the Trial Location',
    source: 'registry',
    requiredBy: ['AKC'],
  },
  // MYK9-2044: AKC Ch. 3 §15, "AKC recording fee shall be stated"; from the dated table in code.
  { id: 'recordingFee', label: 'AKC recording fee', source: 'registry', requiredBy: ['AKC'] },
  { id: 'classes', label: 'Classes offered', source: 'class', requiredBy: ['AKC', 'ASCA'] },
  { id: 'judges', label: 'Judges', source: 'person', requiredBy: ['AKC', 'ASCA'] },
  { id: 'secretary', label: 'Trial Secretary', source: 'person', requiredBy: ['AKC', 'ASCA'] },
  // MYK9-2065: AKC Ch. 3 §15 wants each official's address. It is typed for the premium on the
  // show's official, never taken from their profile, so a home address prints only by choice.
  {
    id: 'secretaryAddress',
    label: 'Trial Secretary mailing address',
    source: 'person',
    requiredBy: ['AKC'],
  },
  // MYK9-2045: the club's Officers list (Club admin > Officers), the one list the premium prints.
  { id: 'officers', label: 'Club officers', source: 'club', requiredBy: [] },
  // MYK9-2064: the club's Event Committee (Club admin > Officers > Committee), which a show may
  // change for itself. AKC needs at least five names; MYK9-2053's checklist reads minimumBy.
  {
    id: 'committee',
    label: 'Event Committee',
    source: 'club',
    requiredBy: ['AKC'],
    minimumBy: { AKC: AKC_EVENT_COMMITTEE_MINIMUM },
  },
  { id: 'chair', label: 'Trial Chair', source: 'person', requiredBy: ['AKC', 'ASCA'] },
  {
    id: 'chairAddress',
    label: 'Trial Chair mailing address',
    source: 'person',
    requiredBy: ['AKC'],
  },
  {
    id: 'entryWindow',
    label: 'Entries open and close',
    source: 'show',
    requiredBy: ['AKC', 'ASCA'],
  },
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

/** A typed mailing address with its edge whitespace gone, or null when nothing was typed. */
function cleanAddress(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export interface PremiumContact {
  name: string;
  email: string | null;
  /** Display-formatted; empty string when there is none. */
  phone: string;
  /** MYK9-2065: the address the club typed for the premium; null prints nothing. */
  mailingAddress: string | null;
}

/** The premium's label for the refund and withdrawal policy row, in every style. */
export const WITHDRAWAL_POLICY_ROW_LABEL = 'Withdrawals and Pulls';

/** The refund and withdrawal policy as the premium prints it. */
export interface PremiumWithdrawalPolicyFact {
  label: string;
  /**
   * The effective text (the show's, else the club's, else the default for the show's
   * registry) with its line breaks, then a blank line and the service-fee sentence. Plain
   * text, never cut: a style prints all of it.
   */
  text: string;
}

/**
 * MYK9-1976: the same text an exhibitor reads in the app, from the policy row generate-premium
 * sends. A premium generated before that row existed carries none, and prints no policy row
 * rather than a default that may not be the club's.
 */
function buildWithdrawalPolicyFact(
  row: GeneratedPremium['show']['withdrawal']
): PremiumWithdrawalPolicyFact | null {
  if (!row) return null;
  const { text } = resolveEffectiveWithdrawalTerms(row);
  return { label: WITHDRAWAL_POLICY_ROW_LABEL, text: buildWithdrawalDisclosure(text) };
}

/** The premium's label for the registry's fixed statement about scouting, in every style. */
export const SCOUTING_STATEMENT_LABEL = 'Scouting the Trial Location';

/** A fixed statement the registry requires the premium to print, in the registry's words. */
export interface PremiumRegistryStatementFact {
  label: string;
  text: string;
}

/**
 * MYK9-2043: the registry's fixed statement, for the PDF and the public page alike: AKC's about
 * not scouting the trial location, ASCA's required statements (MYK9-2225). Null for a registry
 * that requires none (UKC), so no style prints it there.
 */
export function buildScoutingStatementFact(
  registry: RegistryId
): PremiumRegistryStatementFact | null {
  const text = getPremiumScoutingStatement(registry);
  if (text) return { label: SCOUTING_STATEMENT_LABEL, text };
  // MYK9-2225: a registry with no scouting rule may still have fixed statements (ASCA §1.5), which
  // ride the same slot so every PDF body and landing page prints them with no change of its own.
  return getPremiumRequiredStatement(registry);
}

/** One line of the club's officers: "Club secretary: Sam Typed". */
export interface PremiumOfficerFact {
  title: string;
  name: string;
}

/**
 * MYK9-2045: the club's officers as "Title: Name" facts in the Officers list's own position
 * order (president first), ties by name so the order is stable. A title is a label only; it
 * grants nothing. Empty (nothing printed, never a placeholder) when the club lists none.
 */
export function buildOfficerFacts(
  officers: ReadonlyArray<{ position: string; name: string }> | null | undefined
): PremiumOfficerFact[] {
  const rank = (position: string) => OFFICER_POSITION_ORDER.indexOf(position as OfficerPosition);
  return (officers ?? [])
    .map(o => ({ position: o.position, name: o.name.trim() }))
    .filter(o => o.name && rank(o.position) >= 0)
    .sort((a, b) => rank(a.position) - rank(b.position) || a.name.localeCompare(b.name))
    .map(o => ({ title: OFFICER_POSITION_LABELS[o.position as OfficerPosition], name: o.name }));
}

/**
 * MYK9-2064: the Event Committee as trimmed names in the list's own order. Empty (nothing
 * printed, never a placeholder) when the club and the show list none.
 */
export function buildCommitteeFacts(names: ReadonlyArray<string> | null | undefined): string[] {
  return (names ?? []).map(name => name.trim()).filter(Boolean);
}

export interface PremiumTrialFacts {
  name: string;
  /** Long display date. */
  date: string;
  startTime: string | null;
  eventNumber: string | null;
  judges: Array<{ name: string; residence: string | null; classes: string[] }>;
  /** "Element Level Section" in the registry's progression order. */
  classLabels: string[];
  /** MYK9-2227: "Trial entry limit: N entries." when this trial has its own limit, else null. */
  entryLimit: string | null;
  /** MYK9-2227: "Class fee $20: ..." lines, one per distinct class fee; [] when no class has one. */
  classFeeLines: string[];
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
  /** The venue's address (name, street, city, state, zip as stored), '' when unset. */
  venue: string;
  startDate: string;
  fees: {
    preEntry: number | null;
    dayOf: number | null;
    hasAny: boolean;
    /** "Checks", "Cash" in that order, only those the show accepts. */
    paymentMethods: string[];
  };
  /**
   * MYK9-2044: "AKC recording fee: $5.50 per entry" (or, across a rate change, "...$4.50 per
   * entry; $5.50 per entry from January 1, 2027"), derived from this premium: the rate in force
   * on each trial date its schedule prints. Null (no line in any style) when the premium is not
   * AKC or a printed date has no rate in force.
   */
  recordingFee: string | null;
  /** "Total entry limit: N entries." on a UKC (MYK9-2220) or ASCA (§1.5.12) premium whose show has a limit; else null. */
  entryLimit: string | null;
  /** MYK9-2227: "Waitlist: ..." and "Move-ups: ..." lines for the show's rules; [] prints nothing. */
  entryRules: string[];
  /** Null only on a premium generated before MYK9-1976 part 2. */
  withdrawalPolicy: PremiumWithdrawalPolicyFact | null;
  /** The registry's fixed statement (AKC scouting, ASCA §1.5 statements); null for UKC. */
  scoutingStatement: PremiumRegistryStatementFact | null;
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
  /** The club's officers, [] when none: no style prints a heading or placeholder then. */
  officers: PremiumOfficerFact[];
  /** The show's Event Committee names, [] when none: no style prints a heading then. */
  committee: string[];
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
    venue: premiumVenueText(show),
    startDate: show.startDate,
    fees: {
      preEntry: show.preEntryFee,
      dayOf: show.dayOfFee,
      hasAny: (show.preEntryFee ?? 0) > 0 || (show.dayOfFee ?? 0) > 0,
      paymentMethods: [
        // Every show takes online entries (MYK9-2163: the server never lets one be off), so
        // card is always listed. Same name the entry form and receipts use for card
        // (getPaymentMethodLabel).
        'Credit/Debit Card',
        show.acceptChecks && 'Checks',
        show.acceptCash && 'Cash',
      ].filter((m): m is string => Boolean(m)),
    },
    recordingFee: premiumRecordingFeeText(data),
    entryLimit: premiumEntryLimitText(data),
    entryRules: premiumEntryRuleLines(show),
    withdrawalPolicy: buildWithdrawalPolicyFact(show.withdrawal),
    scoutingStatement: buildScoutingStatementFact(registry),
    entry: {
      opens: show.entryOpenDate ? formatPremiumDate(show.entryOpenDate) : null,
      closes: show.entryCloseDate ? formatPremiumDate(show.entryCloseDate) : null,
    },
    secretary: {
      name: secretary.name,
      email: secretary.email,
      phone: formatPhone(secretary.phone),
      mailingAddress: cleanAddress(secretary.mailingAddress),
    },
    chair: officials.chairman
      ? {
          name: officials.chairman.name,
          email: officials.chairman.email,
          phone: formatPhone(officials.chairman.phone),
          mailingAddress: cleanAddress(officials.chairman.mailingAddress),
        }
      : null,
    officers: buildOfficerFacts(data.officers),
    committee: buildCommitteeFacts(data.committee),
    trials: (data.trials ?? []).map(trial => {
      const sortedClasses = [...(trial.classes ?? [])].sort(comparator);
      const classLabels = sortedClasses.map(formatPremiumClassLabel);
      return {
        name: trial.name,
        date: formatPremiumDate(trial.date),
        startTime: trial.startTime,
        eventNumber: trial.eventNumber,
        judges: (trial.judges ?? []).map(j => ({
          name: j.name,
          residence: j.residence?.trim() || null,
          // Only the classes this trial runs, in its own progression order.
          classes: [...new Set(classLabels.filter(label => (j.classes ?? []).includes(label)))],
        })),
        classLabels,
        entryLimit: premiumTrialEntryLimitText(trial),
        classFeeLines: premiumClassFeeLines(sortedClasses),
      };
    }),
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
    showHours: stripPlaceholderNarrative(narratives?.showHours ?? ''),
    trialInformation: stripPlaceholderNarrative(narratives?.trialInformation ?? ''),
  };
}
