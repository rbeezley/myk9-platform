import { EntryStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@/types/check-in-types';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import type { ShowPresence } from '@/features/show-presence/types';

export type PeopleRosterFilter = 'all' | 'needs-check-in' | 'online';

export interface PeopleRosterClassInfo {
  id: string;
  name: string;
  time?: string;
  ring?: string;
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
  ring: string | null;
  statusLabel: string;
  checkInStatus: CheckInStatus;
  eligibleForCheckIn: boolean;
  ineligibleReason: string | null;
  sourceEntry: EntryManagementEntry;
  sourceClass: EntryClass;
}

export interface PeopleRosterPerson {
  id: string;
  name: string;
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
  today?: string | null;
}

const TERMINAL_CHECK_IN_STATUSES = new Set<CheckInStatus>(['checked-in', 'pulled', 'completed']);
const TERMINAL_ENTRY_STATUSES = new Set<EntryStatus>([
  EntryStatus.REJECTED,
  EntryStatus.WAITLIST,
  EntryStatus.CANCELLED,
  EntryStatus.SCRATCHED,
  EntryStatus.COMPLETED,
]);
const TERMINAL_CLASS_STATUSES = new Set<EntryClass['status']>(['scratched', 'absent']);

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
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

function displayName(entry: EntryManagementEntry): string {
  if (hasHandlerIdentity(entry)) {
    return personName(entry.handlerName) || personName(entry.ownerName) || 'Unknown exhibitor';
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
  today: string | null | undefined
): { eligible: boolean; reason: string | null } {
  const status = cls.checkInStatus ?? 'no-status';
  if (TERMINAL_CHECK_IN_STATUSES.has(status)) {
    return { eligible: false, reason: status === 'checked-in' ? 'Checked in' : 'Not active' };
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

  if (today && !info?.trialDate) {
    return { eligible: false, reason: 'Date unavailable' };
  }

  if (today && info?.trialDate !== today) {
    return { eligible: false, reason: 'Not today' };
  }

  return { eligible: true, reason: null };
}

function statusLabel(
  entry: EntryManagementEntry,
  cls: EntryClass,
  eligible: boolean,
  reason: string | null
): string {
  if (eligible) return 'Needs check-in';
  if (reason) return reason;
  if ((cls.checkInStatus ?? 'no-status') === 'checked-in') return 'Checked in';
  if (entry.entryStatus === EntryStatus.WAITLIST) return 'Waitlist';
  return cls.checkInStatus ?? 'No status';
}

function buildClassRows(
  entries: EntryManagementEntry[],
  classesById: Map<string, PeopleRosterClassInfo>,
  today: string | null | undefined
): PeopleRosterClassRow[] {
  return entries.flatMap(entry =>
    entry.classes.map(cls => {
      const classId = cls.classId ?? cls.id;
      const info = classesById.get(classId);
      const eligibility = checkInEligibility(entry, cls, info, today);
      return {
        id: `${entry.id}:${classId}`,
        entryId: entry.id,
        armband: entry.armbandNumber || entry.entryNumber || null,
        dogName: entry.dogName,
        className: info?.name ?? cls.name,
        classNumber: cls.number,
        time: info?.time || null,
        ring: info?.ring || null,
        statusLabel: statusLabel(entry, cls, eligibility.eligible, eligibility.reason),
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
  today,
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
      const authUserId = groupAuthUserId(groupEntries);
      const personPresence = authUserId ? (presenceByUserId.get(authUserId) ?? null) : null;
      const classRows = buildClassRows(groupEntries, classesById, today);
      const dogNames = unique(groupEntries.map(entry => entry.dogName));
      const armbands = unique(classRows.map(row => row.armband ?? ''));
      const searchText = normalize(
        [
          name,
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
