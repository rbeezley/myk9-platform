import { getRegistry } from '@/features/registries';
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
}

interface DogInput {
  name?: string | null;
  call_name?: string | null;
  breed?: string | null;
  color?: string | null;
  sex?: string | null;
  date_of_birth?: string | null;
  akc_number?: string | null;
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

// ─── AKC levels + elements (from registry) ───────────────────────────────────
// Matches the §II class-level grid in the design handoff.
const AKC_LEVELS = ['Novice', 'Advanced', 'Excellent', 'Master'];
const AKC_ELEMENTS = ['Containers', 'Interiors', 'Exteriors', 'Buried'];
const AKC_SPECIAL = ['Handler Discrimination', 'Detective'];

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
  handler?: PersonInput | null;
}

export function buildEntryBlankProps(opts: BuildEntryBlankOptions): EntryBlankProps {
  const { show, trials, classes, judges, club, secretary, entry, dog, handler } = opts;
  // Phase 3: AKC-only per plan §7. When multi-registry support ships, replace
  // with getRegistry(trials[0]?.registry_id ?? 'AKC').
  const registry = getRegistry('AKC');
  const ownerDisplayName = handler
    ? [handler.first_name, handler.last_name].filter(Boolean).join(' ')
    : null;
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

  const levelCells: EntryBlankLevelCell[] = [];
  for (const level of AKC_LEVELS) {
    for (const element of AKC_ELEMENTS) {
      levelCells.push({
        level,
        element,
        checked: level === entryLevel && element === entryElement,
      });
    }
  }
  for (const special of AKC_SPECIAL) {
    levelCells.push({
      level: 'Other',
      element: special,
      checked: entryLevel === 'Master' && entryElement === special,
    });
  }

  // §I — dog
  const dogProps: EntryBlankDog = {
    registeredName: dog?.name ?? null,
    callName: dog?.call_name ?? null,
    breed: dog?.breed ?? null,
    variety: dog?.color ?? null,
    sex: dog?.sex ?? null,
    dateOfBirth: dog?.date_of_birth ?? null,
    placeOfBirth: null,
    registrationNumber: dog?.akc_number ?? null,
    sire: null,
    dam: null,
    breeder: null,
    actualOwners: ownerDisplayName,
  };

  // §III — owner/handler
  const ownerProps: EntryBlankOwner = {
    ownerName: ownerDisplayName,
    handlerName: null,
    mailingAddress: handler?.address ?? null,
    city: handler?.city ?? null,
    state: handler?.state ?? null,
    zip: handler?.zip_code ?? null,
    telephone: handler?.phone ?? null,
    email: handler?.email ?? null,
    juniorHandlerAge: null,
  };

  // §IV — fees
  // AKC convention: first entry includes a $3 mail-in processing surcharge;
  // additional entries are $3 less. Null pre_entry_fee → AKC defaults ($25/$22).
  const preEntry = show.pre_entry_fee ?? 25;
  const additional = show.pre_entry_fee != null ? Math.max(0, preEntry - 3) : 22;
  const total = entry?.entry_fee != null ? formatFee(entry.entry_fee) : null;
  const pm = entry?.payment_status ?? null;
  // Only mail-in payment methods (check/money_order/online) appear on the physical blank.
  // 'paid' and other system statuses map to null (blank checkbox row on the form).
  const MAIL_PAYMENT_METHODS = new Set(['check', 'money_order', 'online']);
  const feesProps: EntryBlankFees = {
    firstEntryFee: formatFee(preEntry),
    additionalEntryFee: formatFee(additional),
    juniorHandlerFee: '$18.00',
    mailProcessingFee: '$3.00',
    totalAmount: total,
    paymentMethod: MAIL_PAYMENT_METHODS.has(pm ?? '')
      ? (pm as 'check' | 'money_order' | 'online')
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

  const timezone = sortedTrials[0]?.timezone ?? 'America/New_York';
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
