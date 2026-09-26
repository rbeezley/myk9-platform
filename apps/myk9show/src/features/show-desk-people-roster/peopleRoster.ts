import { EntryStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@/types/check-in-types';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import type { ShowPresence } from '@/features/show-presence/types';
import { getStatusDescriptor } from '@/components/status';

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
  statusValue: string;
  checkInStatus: CheckInStatus;
  eligibleForCheckIn: boolean;
  ineligibleReason: string | null;
  sourceEntry: EntryManagementEntry;
  sourceClass: EntryClass;
}

export interface PeopleRosterPerson {
  id: string;
  /**
   * MYK9-824 round 3. Always the name on the `handler_id` person record
   * (or the owner's, for a row with no handler at all) — never the printed
   * paperwork text. The Message action names and opens a thread with this
   * SAME person (`authUserId`), so there is no separate "contact name" to
   * track: whoever the row is labelled with is who a message reaches.
   */
  name: string;
  /**
   * MYK9-824 round 3. Printed handler text from this row's entries that
   * reads differently from `name` (a mail-in typed handler whose `handler_id`
   * fell back to the owner, or a stale FK left by a rename). Null when every
   * entry's printed text agrees with `name`, or there is no handler text at
   * all.
   */
  secondaryText: string | null;
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
 * MYK9-824 round 3. The name on the `handler_id` person record, or the
 * owner's when the entry has no handler concept at all. Deliberately does
 * NOT compare against the printed `handlerName` text — round 2's attempt to
 * infer "is this id a real handler or an owner fallback" from that
 * comparison had two bugs of its own (Codex, round 2 follow-up). `handler_id`
 * is trusted directly for whoever it names, fallback or stale FK alike.
 */
function primaryName(entry: EntryManagementEntry): string {
  if (hasHandlerIdentity(entry)) {
    return (
      personName(entry.handlerPersonName) || personName(entry.ownerName) || 'Unknown exhibitor'
    );
  }

  return personName(entry.ownerName) || personName(entry.handlerName) || 'Unknown exhibitor';
}

function groupKey(entry: EntryManagementEntry): string {
  if (hasHandlerIdentity(entry)) {
    return entry.handlerId || entry.handlerAuthUserId || entry.id;
  }

  return (
    entry.ownerId ||
    entry.ownerAuthUserId ||
    entry.registrationId ||
    entry.ownerEmail ||
    normalize(primaryName(entry)) ||
    entry.id
  );
}

function groupAuthUserId(entries: EntryManagementEntry[]): string | null {
  if (entries.some(hasHandlerIdentity)) {
    return entries.find(entry => entry.handlerAuthUserId)?.handlerAuthUserId ?? null;
  }

  return entries.find(entry => entry.ownerAuthUserId)?.ownerAuthUserId ?? null;
}

/**
 * MYK9-824 round 3. Distinct printed handler texts among this row's entries
 * that read differently from `primary` (the row's real name), in first-seen
 * order. Case/punctuation-insensitive comparison so `Hana` and `hana` count
 * as the same text, but the ORIGINAL casing is what's shown.
 */
function secondaryPrintedNames(entries: EntryManagementEntry[], primary: string): string[] {
  const seen = new Set<string>();
  const distinct: string[] = [];
  for (const entry of entries) {
    const printed = personName(entry.handlerName);
    if (!printed) continue;
    const key = normalize(printed);
    if (key === normalize(primary) || seen.has(key)) continue;
    seen.add(key);
    distinct.push(printed);
  }
  return distinct;
}

function classInfoMap(classes: readonly PeopleRosterClassInfo[] = []) {
  return new Map(classes.map(cls => [cls.id, cls]));
}

function formatDateInTimezone(timezone: string | null | undefined, date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(timezone ? { timeZone: timezone } : {}),
  };

  try {
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    return formatDateInTimezone(null, date);
  }

  return date.toISOString().slice(0, 10);
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

    if (info.trialDate !== formatDateInTimezone(info.timezone, currentDate)) {
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

function buildClassRows(
  entries: EntryManagementEntry[],
  classesById: Map<string, PeopleRosterClassInfo>,
  currentDate: Date | null | undefined
): PeopleRosterClassRow[] {
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
        className: info?.name ?? cls.name,
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
      const name = primaryName(groupEntries[0]!);
      const secondaryNames = secondaryPrintedNames(groupEntries, name);
      const secondaryText =
        secondaryNames.length > 0 ? `handled by ${secondaryNames.join(', ')}` : null;
      const authUserId = groupAuthUserId(groupEntries);
      const personPresence = authUserId ? (presenceByUserId.get(authUserId) ?? null) : null;
      const classRows = buildClassRows(groupEntries, classesById, currentDate);
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
        secondaryText,
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
