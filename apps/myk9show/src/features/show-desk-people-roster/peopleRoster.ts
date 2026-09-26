import { EntryStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@/types/check-in-types';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import type { ShowPresence } from '@/features/show-presence/types';
import { getStatusDescriptor } from '@/components/status';
import {
  buildClassDisambiguatorsByGroup,
  buildFullClassLabel,
} from '@/features/_shared/classLabel';
import { isTrialDateToday } from '@/features/_shared/trialDateEligibility';

export type PeopleRosterFilter = 'all' | 'needs-check-in' | 'online';

export interface PeopleRosterClassInfo {
  id: string;
  name: string;
  time?: string;
  /** Trial identity shown alongside the class (e.g. "Trial 2") — a dog entered
   *  in the same class shape across two same-day trials needs this to tell
   *  the rows apart (MYK9-825). Despite the name, this is a trial label, not
   *  a physical ring number — see `ring` usage at the ShowDeskPeopleRoster call site. */
  ring?: string;
  trialId?: string;
  /** Registry element/level/section — the row label is composed from these,
   *  not `name` alone, so a UKC A/B split still renders its section. */
  element?: string | null;
  level?: string | null;
  section?: string | null;
  trialDate?: string;
  timezone?: string | null;
}

export interface PeopleRosterClassRow {
  id: string;
  entryId: string;
  armband: string | null;
  dogName: string;
  className: string;
  classNumber: string;
  time: string | null;
  /** Trial label (e.g. "Trial 2"), shown so the same class in two trials is distinguishable. */
  ring: string | null;
  statusLabel: string;
  statusValue: string;
  checkInStatus: CheckInStatus;
  eligibleForCheckIn: boolean;
  ineligibleReason: string | null;
  sourceEntry: EntryManagementEntry;
  sourceClass: EntryClass;
}

export interface PeopleRosterPerson {
  id: string;
  name: string;
  /**
   * MYK9-824 round 3. Distinct printed handler texts within this row that
   * differ from `name` -- e.g. two mail-in entries typed for different
   * handlers who share this same person as their `handler_id` fallback (an
   * unmatched typed handler defaults to the dog's owner). The row is keyed
   * and labelled by the PERSON on `handler_id`, so both stay in one row; this
   * is how their own, different printed names are not simply dropped.
   */
  alternateNames: string[];
  searchText: string;
  authUserId: string | null;
  presence: ShowPresence | null;
  dogNames: string[];
  armbands: string[];
  classRows: PeopleRosterClassRow[];
  eligibleCount: number;
  summary: string;
  badge: string | null;
}

interface BuildPeopleRosterOptions {
  entries: EntryManagementEntry[];
  presence: ShowPresence[];
  classes?: readonly PeopleRosterClassInfo[];
  currentDate?: Date | null;
}

const TERMINAL_CHECK_IN_STATUSES = new Set<CheckInStatus>(['checked-in', 'pulled', 'completed']);
const TERMINAL_ENTRY_STATUSES = new Set<EntryStatus>([
  EntryStatus.REJECTED,
  EntryStatus.WAITLIST,
  EntryStatus.CANCELLED,
  EntryStatus.SCRATCHED,
  EntryStatus.COMPLETED,
]);
// MYK9-632: 'withdrawn' is its own class status now. It is as terminal as a
// pull for roster purposes — neither dog is going in the ring.
const TERMINAL_CLASS_STATUSES = new Set<EntryClass['status']>(['scratched', 'withdrawn', 'absent']);

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Trial identity shown alongside a class row (feeds `PeopleRosterClassInfo.ring`).
 * `trialName` alone collides when two same-day trials share a name (MYK9-825)
 * — a real, common case, since the show-creation wizard's own default names
 * trials "Trial 1", "Trial 2", etc. So both name and number are shown UNLESS
 * the name already reads as that number (e.g. name "Trial 1", number "1"),
 * where appending it would only repeat it.
 *
 * Never prefixes either value with the literal word "Trial": `trial_number`
 * is free text the wizard sometimes writes as an already-worded identity, not
 * a bare ordinal (seed-demo.sql's UKC demo trial has trial_number
 * 'UKC-Nosework'), and `trialLabel.ts` (MYK9-704, `@myk9/core`) exists
 * precisely because prefixing a stored label produced "Trial Trial 1" /
 * "Trial Saturday T 2". Shown as-is, same convention as that helper.
 */
export function formatTrialIdentity(
  trialName: string | null | undefined,
  trialNumber: string | null | undefined
): string | null {
  const name = (trialName ?? '').trim();
  const number = (trialNumber ?? '').trim();
  if (!name) return number || null;
  if (!number || name.includes(number)) return name;
  return `${name} (${number})`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim()))];
}

function personName(value: string | null | undefined): string | null {
  const name = (value ?? '').trim();
  if (!name) return null;
  if (normalize(name) === 'not specified') return null;
  return name;
}

function hasHandlerIdentity(entry: EntryManagementEntry): boolean {
  return Boolean(entry.handlerId || entry.handlerAuthUserId || personName(entry.handlerName));
}

/**
 * MYK9-824 round 3 (Codex, owner-approved). The roster keys and labels a row
 * by the PERSON `handler_id` names -- `handlerPersonName`, straight from the
 * join -- not by the printed `handler` text. Round 2 tried to infer from the
 * printed text whether `handler_id` was a real handler or the owner fallback
 * and kept splitting or mislabelling one of the two; this stops guessing.
 * `handlerPersonName` already IS the owner's own name when the fallback
 * fired (handler_id = owner_id), so no owner/fallback comparison is needed
 * here at all.
 */
function displayName(entry: EntryManagementEntry): string {
  if (hasHandlerIdentity(entry)) {
    return (
      personName(entry.handlerPersonName) ||
      personName(entry.handlerName) ||
      personName(entry.ownerName) ||
      'Unknown exhibitor'
    );
  }

  return personName(entry.ownerName) || personName(entry.handlerName) || 'Unknown exhibitor';
}

function groupKey(entry: EntryManagementEntry): string {
  if (hasHandlerIdentity(entry)) {
    return (
      entry.handlerId ||
      entry.handlerAuthUserId ||
      normalize(personName(entry.handlerName)) ||
      entry.id
    );
  }

  return (
    entry.ownerId ||
    entry.ownerAuthUserId ||
    entry.registrationId ||
    entry.ownerEmail ||
    normalize(displayName(entry)) ||
    entry.id
  );
}

/** Printed handler texts in this group that are not just the row's own label, for the "also entered as" line. */
function alternateHandlerNames(entries: EntryManagementEntry[], label: string): string[] {
  const labelNorm = normalize(label);
  return unique(
    entries
      .map(entry => personName(entry.handlerName) ?? '')
      .filter(name => name && normalize(name) !== labelNorm)
  );
}

function groupAuthUserId(entries: EntryManagementEntry[]): string | null {
  if (entries.some(hasHandlerIdentity)) {
    return entries.find(entry => entry.handlerAuthUserId)?.handlerAuthUserId ?? null;
  }

  return entries.find(entry => entry.ownerAuthUserId)?.ownerAuthUserId ?? null;
}

function classInfoMap(classes: readonly PeopleRosterClassInfo[] = []) {
  return new Map(classes.map(cls => [cls.id, cls]));
}

function checkInEligibility(
  entry: EntryManagementEntry,
  cls: EntryClass,
  info: PeopleRosterClassInfo | undefined,
  currentDate: Date | null | undefined
): { eligible: boolean; reason: string | null } {
  const status = cls.checkInStatus ?? 'no-status';
  if (TERMINAL_CHECK_IN_STATUSES.has(status)) {
    return { eligible: false, reason: status === 'checked-in' ? null : 'Not active' };
  }

  if (entry.entryStatus !== EntryStatus.ACCEPTED) {
    return {
      eligible: false,
      reason: entry.entryStatus === EntryStatus.WAITLIST ? 'Waitlist' : 'Not accepted',
    };
  }

  if (TERMINAL_ENTRY_STATUSES.has(entry.entryStatus) || TERMINAL_CLASS_STATUSES.has(cls.status)) {
    return { eligible: false, reason: 'Not active' };
  }

  if (currentDate) {
    if (!info?.trialDate) {
      return { eligible: false, reason: 'Date unavailable' };
    }

    if (!isTrialDateToday(info.trialDate, info.timezone, currentDate)) {
      return { eligible: false, reason: 'Not today' };
    }
  }

  return { eligible: true, reason: null };
}

function statusPresentation(
  entry: EntryManagementEntry,
  cls: EntryClass,
  eligible: boolean,
  reason: string | null
): { label: string; value: string } {
  const value =
    entry.entryStatus === EntryStatus.WAITLIST
      ? entry.entryStatus
      : eligible
        ? 'not_checked_in'
        : (cls.checkInStatus ?? 'no-status');
  return {
    label: reason ?? getStatusDescriptor('entry', value).label,
    value,
  };
}

function classLabelResolver(
  classes: readonly PeopleRosterClassInfo[]
): (info: PeopleRosterClassInfo) => string {
  // One disambiguator per trial (LESSONS label-rule-vs-real-columns): two
  // classes sharing element+level+section across DIFFERENT trials are not a
  // collision, they're the ordinary two-trials-same-day case this fix exists
  // to distinguish some other way (the `ring` trial label, not extra words).
  const disambiguatorFor = buildClassDisambiguatorsByGroup(classes, info => info.trialId ?? '');

  return info => {
    const identity = {
      name: info.name,
      element: info.element,
      level: info.level,
      section: info.section,
    };
    const extra = disambiguatorFor(info.trialId ?? '')(identity);
    return buildFullClassLabel(identity, extra, info.name);
  };
}

function buildClassRows(
  entries: EntryManagementEntry[],
  classesById: Map<string, PeopleRosterClassInfo>,
  currentDate: Date | null | undefined
): PeopleRosterClassRow[] {
  const labelOf = classLabelResolver([...classesById.values()]);
  return entries.flatMap(entry =>
    entry.classes.map(cls => {
      const classId = cls.classId ?? cls.id;
      const info = classesById.get(classId);
      const eligibility = checkInEligibility(entry, cls, info, currentDate);
      const status = statusPresentation(entry, cls, eligibility.eligible, eligibility.reason);
      return {
        id: `${entry.id}:${classId}`,
        entryId: entry.id,
        armband: entry.armbandNumber || entry.entryNumber || null,
        dogName: entry.dogName,
        className: info ? labelOf(info) : cls.name,
        classNumber: cls.number,
        time: info?.time || null,
        ring: info?.ring || null,
        statusLabel: status.label,
        statusValue: status.value,
        checkInStatus: cls.checkInStatus ?? 'no-status',
        eligibleForCheckIn: eligibility.eligible,
        ineligibleReason: eligibility.reason,
        sourceEntry: entry,
        sourceClass: cls,
      };
    })
  );
}

function buildSummary(dogNames: string[], classCount: number): string {
  const dogLabel = dogNames.length === 1 ? dogNames[0] : `${dogNames.length} dogs`;
  const classLabel = `${classCount} ${classCount === 1 ? 'class' : 'classes'}`;
  return `${dogLabel} - ${classLabel}`;
}

function buildBadge(rows: PeopleRosterClassRow[]): string | null {
  const due = rows.filter(row => row.eligibleForCheckIn).length;
  if (due > 0) return `${due} due`;
  if (rows.some(row => row.statusLabel === 'Waitlist')) return 'WL';
  const firstArmband = rows.find(row => row.armband)?.armband;
  return firstArmband ?? null;
}

export function buildPeopleRoster({
  entries,
  presence,
  classes = [],
  currentDate,
}: BuildPeopleRosterOptions): PeopleRosterPerson[] {
  const classesById = classInfoMap(classes);
  const presenceByUserId = new Map(presence.map(person => [person.userId, person]));
  const grouped = new Map<string, EntryManagementEntry[]>();

  for (const entry of entries) {
    const key = groupKey(entry);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  return [...grouped.entries()]
    .map(([id, groupEntries]) => {
      const name = displayName(groupEntries[0]!);
      const alternateNames = alternateHandlerNames(groupEntries, name);
      const authUserId = groupAuthUserId(groupEntries);
      const personPresence = authUserId ? (presenceByUserId.get(authUserId) ?? null) : null;
      const classRows = buildClassRows(groupEntries, classesById, currentDate);
      const dogNames = unique(groupEntries.map(entry => entry.dogName));
      const armbands = unique(classRows.map(row => row.armband ?? ''));
      const searchText = normalize(
        [
          name,
          ...alternateNames,
          ...groupEntries.map(entry => personName(entry.ownerName) ?? ''),
          ...groupEntries.map(entry => personName(entry.handlerName) ?? ''),
          ...dogNames,
          ...armbands,
          ...classRows.map(row => row.className),
        ].join(' ')
      );

      return {
        id,
        name,
        alternateNames,
        searchText,
        authUserId,
        presence: personPresence,
        dogNames,
        armbands,
        classRows,
        eligibleCount: classRows.filter(row => row.eligibleForCheckIn).length,
        summary: buildSummary(dogNames, classRows.length),
        badge: buildBadge(classRows),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterPeopleRoster(
  roster: PeopleRosterPerson[],
  search: string,
  filter: PeopleRosterFilter
): PeopleRosterPerson[] {
  const query = normalize(search);
  return roster.filter(person => {
    if (filter === 'needs-check-in' && person.eligibleCount === 0) return false;
    if (filter === 'online' && !person.presence) return false;
    return !query || person.searchText.includes(query);
  });
}
