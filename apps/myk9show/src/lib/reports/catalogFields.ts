/**
 * MYK9-1009: the pure rules behind the AKC marked catalog (Scent Work
 * Regulations Ch.3 §36-37) -- result codes, the class header counts, and the
 * owner / handler fields the mapper projects onto `ReportEntry`.
 *
 * Kept out of the component so the counts can be asserted without rendering,
 * and out of `reportDataMapping.ts`, which sits at the file-length ceiling.
 */
import { handlerNameMatchesPerson } from '@/features/registries/handlerIdentity';
import { isExpectedEntry } from '@/features/_shared/entryAccounting';
import { formatReportDate } from './reportUtils';
import type { ReportDbEntry, ReportEntry } from './types';

type OwnerLike = NonNullable<NonNullable<ReportDbEntry['dog']>['owner']>;

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function joinNonBlank(parts: ReadonlyArray<string | null | undefined>, separator: string): string {
  return parts
    .map(part => part?.trim() ?? '')
    .filter(Boolean)
    .join(separator);
}

/** "123 Main St, Austin, TX 78701" from whatever parts are known; '' when none are. */
export function formatOwnerAddress(owner: OwnerLike | null | undefined): string {
  if (!owner) return '';
  const region = joinNonBlank([owner.state, owner.zip_code], ' ');
  return joinNonBlank([owner.street_address, owner.city, region], ', ');
}

/** The dog owner's full name, or '' when the owner row was not read. */
export function formatOwnerName(owner: OwnerLike | null | undefined): string {
  return joinNonBlank([owner?.first_name, owner?.last_name], ' ');
}

/**
 * Does the entry name a handler other than the owner?
 *
 * `source === 'owner'` means the projection itself fell back to the owner, so
 * the two are the same person. Otherwise the printed handler name is compared
 * with the owner's name the way every other paperwork path does
 * (`handlerNameMatchesPerson`), so "Smith, Jane" and "jane smith" are one
 * person. A handler that cannot be named at all is not "different": the catalog
 * prints no handler rather than a placeholder.
 */
export function handlerDiffersFromOwner(input: {
  handlerName: string | null;
  source: string;
  owner: OwnerLike | null | undefined;
}): boolean {
  const name = input.handlerName?.trim() ?? '';
  if (!name || input.source === 'owner' || input.source === 'unknown') return false;
  return !handlerNameMatchesPerson(name, input.owner);
}

/** `YYYY-MM-DD` to the printed `M/D/YYYY`; '' for a missing or malformed date. */
export function formatCatalogDate(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return '';
  return formatReportDate(isoDate.slice(0, 10));
}

export const CATALOG_RESULT = {
  QUALIFIED: 'Q',
  NOT_QUALIFIED: 'NQ',
  ABSENT: 'ABS',
  EXCUSED: 'EXC',
  DISQUALIFIED: 'DQ',
  /** Withdrawn, dog in season (AKC glossary "Withdrawn Entry"). */
  WITHDRAWN_IN_SEASON: 'AIS',
  /** Withdrawn, judge change. */
  WITHDRAWN_JUDGE_CHANGE: 'AJC',
  /** Withdrawn with no recorded reason code (a pre-MYK9-632 row). */
  WITHDRAWN: 'WD',
  /** Pulled / scratched: entered, did not run, and is not a withdrawal. */
  PULLED: 'Pulled',
} as const;

/**
 * Withdrawn by entry status, or by a scoring result: the scoring editor records
 * `result_status: 'withdrawn'` without touching `entry_status`.
 */
function isWithdrawn(entry: Pick<ReportEntry, 'entryStatus' | 'resultText'>): boolean {
  return (
    normalized(entry.entryStatus) === 'withdrawn' || normalized(entry.resultText) === 'withdrawn'
  );
}

/**
 * The stored placement as a number. Replication hands placements over as
 * strings ('10000'), so comparing the raw value to a number silently misses.
 */
function placementNumber(entry: Pick<ReportEntry, 'finalPlacement'>): number | null {
  const value = Number(entry.finalPlacement);
  return entry.finalPlacement == null || Number.isNaN(value) ? null : value;
}

/** Moved-up source rows and not-accepted rows were never a dog in this class. */
function isNeverInClass(entry: Pick<ReportEntry, 'entryStatus'>): boolean {
  const status = normalized(entry.entryStatus);
  return status === 'moved' || status === 'not_accepted';
}

/** The code the marked catalog prints in the Result column ('' while unscored). */
export function resolveCatalogResult(entry: ReportEntry): string {
  if (isWithdrawn(entry)) {
    if (entry.withdrawalReasonCode === 'in_season') return CATALOG_RESULT.WITHDRAWN_IN_SEASON;
    if (entry.withdrawalReasonCode === 'judge_change') return CATALOG_RESULT.WITHDRAWN_JUDGE_CHANGE;
    return CATALOG_RESULT.WITHDRAWN;
  }
  const entryStatus = normalized(entry.entryStatus);
  const result = normalized(entry.resultText);
  if (entryStatus === 'absent' || result === 'absent') return CATALOG_RESULT.ABSENT;
  if (result === 'q' || result === 'qualified') return CATALOG_RESULT.QUALIFIED;
  if (result === 'nq') return CATALOG_RESULT.NOT_QUALIFIED;
  // No stored DQ result exists today (`entries.result_status` has no such value),
  // so a DQ prints only when a row carries the legacy DQ placement or word.
  if (result === 'dq' || result === 'disqualified' || placementNumber(entry) === 10000) {
    return CATALOG_RESULT.DISQUALIFIED;
  }
  if (result === 'excused') return CATALOG_RESULT.EXCUSED;
  if (entryStatus === 'scratched' || normalized(entry.checkInStatus) === 'pulled') {
    return CATALOG_RESULT.PULLED;
  }
  return '';
}

export interface CatalogClassCounts {
  /** Entries at closing, less withdrawn. */
  entries: number;
  /** Dogs that actually came to the ring. */
  competing: number;
  /** Competing dogs with a qualifying score. */
  qualifying: number;
  withdrawn: number;
}

/**
 * The four numbers AKC Ch.3 §36 requires at the head of each class.
 *
 *  - withdrawn:  `entry_status = 'withdrawn'` (the two recognised reasons).
 *    A pull / scratch is NOT a withdrawal (owner ruling 2026-09-17).
 *  - entries:    every row that was a dog in this class, less the withdrawn
 *    ones. A dog that was pulled or marked absent was still entered, so it
 *    stays; only moved-up source rows and not-accepted rows (never a dog in
 *    this class) are left out. `isOnClassRunList` is deliberately not used here:
 *    it also drops scratched and absent dogs, which would understate entries.
 *  - competing:  entries the show expected to run (`isExpectedEntry`: not
 *    withdrawn / scratched / absent / moved / not accepted, not pulled, not
 *    deleted) whose result is not Absent -- an absence is recorded as a result
 *    as often as as an entry status.
 *  - qualifying: competing dogs whose result prints as Q.
 */
export function countCatalogClass(entries: readonly ReportEntry[]): CatalogClassCounts {
  const inClass = entries.filter(entry => !isNeverInClass(entry));
  const withdrawn = inClass.filter(isWithdrawn).length;
  const competingEntries = inClass.filter(
    entry =>
      isExpectedEntry({
        entryStatus: entry.entryStatus,
        checkInStatus: entry.checkInStatus ?? undefined,
      }) &&
      !isWithdrawn(entry) &&
      resolveCatalogResult(entry) !== CATALOG_RESULT.ABSENT
  );
  return {
    entries: inClass.length - withdrawn,
    competing: competingEntries.length,
    qualifying: competingEntries.filter(
      entry => resolveCatalogResult(entry) === CATALOG_RESULT.QUALIFIED
    ).length,
    withdrawn,
  };
}

/** Rows the catalog lists: every dog that was in the class (see `countCatalogClass`). */
export function catalogRows(entries: readonly ReportEntry[]): ReportEntry[] {
  return entries.filter(entry => !isNeverInClass(entry));
}

/** Placement 1-4 as printed; anything else (including sentinel codes) prints blank. */
export function catalogPlacement(entry: ReportEntry): string {
  const placement = placementNumber(entry);
  return placement != null && placement >= 1 && placement <= 4 ? String(placement) : '';
}

/**
 * Fields the marked catalog adds to a `ReportEntry`, projected from the hydrated
 * database entry. `registeredName` comes from the caller because it needs the
 * trial's registry, which this module does not know.
 */
export function mapCatalogEntryFields(
  e: ReportDbEntry,
  handler: { name: string | null; source: string },
  registeredName: string | null
): Partial<ReportEntry> {
  const owner = e.dog?.owner;
  const ownerName = formatOwnerName(owner);
  const ownerAddress = formatOwnerAddress(owner);
  return {
    ...(registeredName ? { registeredName } : {}),
    ...(e.dog?.date_of_birth ? { dateOfBirth: e.dog.date_of_birth } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(ownerAddress ? { ownerAddress } : {}),
    // `street_address` is only ever present on a row the hydration read (the replica
    // owner carries an id and null names), so its presence means "read".
    ...(owner && owner.street_address !== undefined && !ownerAddress
      ? { ownerAddressMissing: true }
      : {}),
    ...(handlerDiffersFromOwner({ handlerName: handler.name, source: handler.source, owner })
      ? { handlerDiffersFromOwner: true }
      : {}),
    ...(e.withdrawal_reason_code ? { withdrawalReasonCode: e.withdrawal_reason_code } : {}),
    ...(e.disqualification_reason ? { resultReason: e.disqualification_reason } : {}),
  };
}
