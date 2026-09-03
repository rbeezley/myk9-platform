import { getTrialRegistry, getTrialTimezone } from '@/features/registries';
import {
  resolveDogIdentityForOrganization,
  type DogRegistrationLike,
} from '@/features/dogs/identity';
import {
  getScentWorkSport,
  scentWorkGrid,
  scentWorkSpecialElementLabels,
} from '@/features/registries/scentWork';
import { toRoman } from '@/features/heritage/landing/useHeritageLandingData';
import { formatFee } from '@/utils/format';
import type {
  EntryBlankDog,
  EntryBlankFees,
  EntryBlankLevelCell,
  EntryBlankMailTo,
  EntryBlankOwner,
  EntryBlankProps,
  EntryBlankTrialRow,
} from './types';

// ─── Input types ──────────────────────────────────────────────────────────────
//
// These mirror the Supabase Row shapes we care about. We use intersection types
// rather than importing the full generated DB types so this module compiles even
// before `supabase gen types` runs with the migration-192 columns.

interface ShowInput {
  name: string;
  start_date: string;
  end_date: string;
  entry_close_date?: string | null;
  pre_entry_fee?: number | null;
  organization?: string | null;
}

interface TrialInput {
  id: string;
  date: string;
  trial_number?: string | null;
  display_order?: number | null;
  // migration-192 columns (may be absent until type-regen)
  timezone?: string | null;
  registry_id?: string | null;
}

interface ClassInput {
  id: string;
  trial_id: string;
  level?: string | null;
  element?: string | null;
  section?: string | null;
  name?: string | null;
}

interface JudgeInput {
  trial_id: string;
  judgeName: string;
}

interface ClubInput {
  name: string;
}

interface SecretaryInput {
  name?: string | null;
  poBox?: string | null;
  cityStateZip?: string | null;
  email?: string | null;
  emailSubject?: string | null;
}

interface EntryInput {
  trial_id?: string | null;
  class_id?: string | null;
  entry_fee?: number | null;
  payment_status?: string | null;
  payment_method?: string | null;
}

interface DogInput {
  name?: string | null;
  call_name?: string | null;
  color?: string | null;
  sex?: string | null;
  date_of_birth?: string | null;
  /**
   * The dog's `dog_registrations` rows. Registered name, breed, variety, and
   * registration number are read from the registration for the TRIAL'S
   * sanctioning organization — never from `dogs.akc_number` (which nothing in
   * the app writes; the flat column is NULL for every row) and never from
   * another organization's registration. MYK9-90.
   *
   * Callers must include `id` and `created_at` on these rows (selecting
   * `dog_registrations(*)`, as every `reads.ts` embed does, satisfies this).
   * They are the resolver's tiebreak fields: `UNIQUE (dog_id, organization)`
   * is an exact-string constraint, so one dog can hold both `AKC` and
   * `AKC (American Kennel Club)` rows, and without the ordering fields the
   * comparator ties and the printed registration number becomes dependent on
   * row order.
   */
  registrations?: readonly DogRegistrationLike[] | null;
}

interface PersonInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

// ─── Date formatting ──────────────────────────────────────────────────────────

function formatTrialDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const date = d.getDate();
  return `${day} ${date} ${month}`;
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(endIso + 'T00:00:00');
  const startDay = start.getDate();
  const endDay = end.getDate();
  const month = start.toLocaleDateString('en-US', { month: 'long' });
  const year = start.getFullYear();
  if (start.getMonth() === end.getMonth()) {
    return `${startDay} – ${endDay} ${month} ${year}`;
  }
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
  return `${startDay} ${month} – ${endDay} ${endMonth} ${year}`;
}

function formatCloseDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// ─── Trial numeral ────────────────────────────────────────────────────────────

function resolveNumeral(trial: TrialInput, index: number): string {
  if (trial.trial_number) return trial.trial_number;
  return toRoman(trial.display_order ?? index + 1);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface BuildEntryBlankOptions {
  show: ShowInput;
  trials: TrialInput[];
  classes: ClassInput[];
  judges: JudgeInput[];
  club: ClubInput;
  secretary: SecretaryInput;
  /** Omit for blank mode; provide for pre-filled mode. */
  entry?: EntryInput | null;
  dog?: DogInput | null;
  owner?: PersonInput | null;
  handler?: PersonInput | null;
}

// Existing single-pass form assembly is intentionally kept intact for this
// narrow owner/handler contract fix; decomposing it is separate refactor work.
export function buildEntryBlankProps(opts: BuildEntryBlankOptions): EntryBlankProps {
  const { show, trials, classes, judges, club, secretary, entry, dog, owner, handler } = opts;
  // Bind to the trial's registry via the shared selector (trims + defaults to AKC for
  // blank/missing registry_id; throws in dev / falls back to AKC in prod for unknown ids).
  // NOTE: this drives the §II grid, which is form-wide and therefore keyed off the first
  // trial. Dog identity is resolved against the ENTRY'S trial instead — see below.
  const registry = getTrialRegistry(trials[0]);
  const sport = getScentWorkSport(registry.id);
  // Older callers supplied only `handler` when the handler was also the owner.
  // Keep that shape compatible while allowing designated handlers to remain
  // distinct from the registered owner on pre-filled forms.
  const ownerPerson = owner ?? handler;
  const ownerDisplayName = ownerPerson
    ? [ownerPerson.first_name, ownerPerson.last_name].filter(Boolean).join(' ')
    : null;
  const handlerDisplayName =
    owner && handler ? [handler.first_name, handler.last_name].filter(Boolean).join(' ') : null;
  const entryClassId = entry?.class_id ?? null;
  const entryTrialId = entry?.trial_id ?? null;

  // §II — trial rows
  const sortedTrials = [...trials].sort(
    (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)
  );
  const trialRows: EntryBlankTrialRow[] = sortedTrials.map((trial, i) => {
    const trialClasses = classes.filter(c => c.trial_id === trial.id);
    const elements = trialClasses
      .map(c => c.element ?? c.name ?? '')
      .filter(Boolean)
      .join(' · ');
    const judge = judges.find(j => j.trial_id === trial.id);
    return {
      numeral: resolveNumeral(trial, i),
      dateLabel: formatTrialDate(trial.date),
      elementsLabel: elements || '—',
      judgeName: judge?.judgeName ?? '—',
      checked: entryTrialId === trial.id,
    };
  });

  // §II — level/element grid
  const entryClass = entryClassId ? classes.find(c => c.id === entryClassId) : null;
  const entryLevel = entryClass?.level ?? null;
  const entryElement = entryClass?.element ?? null;
  const entrySection = entryClass?.section ?? null;

  // §II grid: rows (levels + continuation variants like ASCA Level C) × element columns, then
  // the special rows. Matching uses the canonical element label (`column.label`), not the
  // pluralized display label, so prefilled entries (which store the canonical `classes.element`)
  // line up; the displayed cell still uses the gridLabel.
  const grid = scentWorkGrid(sport);
  const specialElements = scentWorkSpecialElementLabels(sport);

  const levelCells: EntryBlankLevelCell[] = [];
  for (const row of grid.rows) {
    const continuationSections = grid.continuationSectionsByLevel[row.level] ?? [];
    for (const column of grid.columns) {
      const isMatch = entryElement === column.label && entryLevel === row.level;
      const sectionMatches = row.section
        ? entrySection === row.section // continuation row (e.g. Level C) — match its section
        : !continuationSections.includes(entrySection ?? ''); // base row — exclude continuation sections
      levelCells.push({
        level: row.label,
        element: column.gridLabel,
        checked: isMatch && sectionMatches,
      });
    }
  }
  for (const special of specialElements) {
    levelCells.push({
      level: 'Other',
      element: special,
      // A special row represents the element, not a specific level (the level isn't shown on the
      // 'Other' row), so it checks whenever the entry is for that element — at ANY level. This
      // covers UKC HD's Novice/Advanced/Excellent/Master and AKC's level-less Detective, both of
      // which the old `=== 'Master'` guard missed.
      checked: entryElement === special,
    });
  }

  // §I — dog.
  //
  // Identity comes from the registration held with the sanctioning organization
  // of the trial THIS ENTRY IS FOR — not `trials[0]`. A show may carry trials
  // bound to different registries (`trials.registry_id`), so keying off the
  // first trial would print, say, the dog's AKC registered name and number on a
  // form for a UKC trial. That is the cross-organization leak this whole
  // change exists to prevent. In blank mode there is no entry, so the first
  // trial is the only available answer and the fields print empty regardless.
  //
  // No cross-organization fallback: this form is mailed to that body, and a
  // borrowed registration number or breed is worse than a blank. A dog with no
  // registration for the organization prints blank and raises
  // `missingRegistration` so the operator sees it before mailing.
  const entryTrial = entryTrialId ? (trials.find(t => t.id === entryTrialId) ?? null) : null;
  const identityRegistry = entryTrial ? getTrialRegistry(entryTrial) : registry;
  const dogIdentity = resolveDogIdentityForOrganization(dog?.registrations, identityRegistry.id);
  const dogProps: EntryBlankDog = {
    registeredName: dogIdentity.registeredName,
    callName: dog?.call_name ?? null,
    breed: dogIdentity.breed,
    // `variety` is a registration attribute; `dogs.color` is the legacy source
    // and is used only when the registration records no variety.
    variety: dogIdentity.variety ?? dog?.color ?? null,
    sex: dog?.sex ?? null,
    dateOfBirth: dog?.date_of_birth ?? null,
    placeOfBirth: null,
    registrationNumber: dogIdentity.registrationNumber,
    missingRegistration: dog != null && dogIdentity.registrationNumber == null,
    sire: null,
    dam: null,
    breeder: null,
    actualOwners: ownerDisplayName,
  };

  // §III — owner/handler
  const ownerProps: EntryBlankOwner = {
    ownerName: ownerDisplayName,
    handlerName: handlerDisplayName,
    mailingAddress: ownerPerson?.address ?? null,
    city: ownerPerson?.city ?? null,
    state: ownerPerson?.state ?? null,
    zip: ownerPerson?.zip_code ?? null,
    telephone: ownerPerson?.phone ?? null,
    email: ownerPerson?.email ?? null,
    juniorHandlerAge: null,
  };

  // §IV — fees
  // AKC convention: first entry includes a $3 mail-in processing surcharge;
  // additional entries are $3 less. Null pre_entry_fee → AKC defaults ($25/$22).
  const preEntry = show.pre_entry_fee ?? 25;
  const additional = show.pre_entry_fee != null ? Math.max(0, preEntry - 3) : 22;
  const total = entry?.entry_fee != null ? formatFee(entry.entry_fee) : null;
  // Only mail-in payment methods (check/money_order/online) appear on the physical blank.
  // 'paid' and other system statuses map to null (blank checkbox row on the form).
  const paymentMethod = entry?.payment_method;
  const MAIL_PAYMENT_METHODS = new Set(['check', 'money_order', 'online']);
  const feesProps: EntryBlankFees = {
    firstEntryFee: formatFee(preEntry),
    additionalEntryFee: formatFee(additional),
    juniorHandlerFee: '$18.00',
    mailProcessingFee: '$3.00',
    totalAmount: total,
    paymentMethod: MAIL_PAYMENT_METHODS.has(paymentMethod ?? '')
      ? (paymentMethod as 'check' | 'money_order' | 'online')
      : null,
  };

  // §VI — mail-to
  const mailTo: EntryBlankMailTo = {
    secretaryName: secretary.name ?? null,
    poBox: secretary.poBox ?? null,
    cityStateZip: secretary.cityStateZip ?? null,
    email: secretary.email ?? null,
    emailSubject: secretary.emailSubject ?? null,
  };

  const timezone = getTrialTimezone(sortedTrials[0]);
  const closeIso = show.entry_close_date ?? null;

  return {
    clubName: club.name,
    showTitle: show.name,
    licenseLanguage: registry.licenseLanguage,
    dateRange: formatDateRange(show.start_date, show.end_date),
    entryCloseIso: closeIso,
    timezone,
    dog: dogProps,
    trials: trialRows,
    levelCells,
    owner: ownerProps,
    fees: feesProps,
    agreementText: registry.exhibitorAgreement,
    mailTo,
    closeDate: closeIso ? formatCloseDate(closeIso) : null,
    confirmationDate: null,
    onlineEntryUrl: null,
  };
}
