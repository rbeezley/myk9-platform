/**
 * Pure logic for Entry Forms' "Check-in desk" view (MYK9-1689). Row building, eligibility and
 * search are the People roster's own (`peopleRoster.ts`), imported rather than copied, so the
 * two cannot disagree about who can be checked in or what a search matches.
 */
import {
  buildPeopleRoster,
  filterPeopleRoster,
  type PeopleRosterClassInfo,
  type PeopleRosterClassRow,
  type PeopleRosterPerson,
} from '@/components/entries/management/checkInDesk/peopleRoster';
import type { CheckInStatus } from '@myk9/core';
import { buildTrialRingResolver } from '@/components/entries/management/checkInDesk/trialRingLabel';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { Trial, TrialClass } from '@/components/trials/types/trial.types';
import { getTrialTimezone } from '@/features/registries';

export type CheckInDeskFilter = 'all' | 'not-checked-in';

/** The URL spelling of the "not checked in" filter (`?checkin=pending`). */
export const CHECK_IN_FILTER_PARAM = 'checkin';
export const CHECK_IN_PENDING_VALUE = 'pending';

export function readCheckInFilter(params: URLSearchParams): CheckInDeskFilter {
  return params.get(CHECK_IN_FILTER_PARAM) === CHECK_IN_PENDING_VALUE ? 'not-checked-in' : 'all';
}

export function writeCheckInFilter(
  source: URLSearchParams,
  filter: CheckInDeskFilter
): URLSearchParams {
  const next = new URLSearchParams(source);
  if (filter === 'not-checked-in') next.set(CHECK_IN_FILTER_PARAM, CHECK_IN_PENDING_VALUE);
  else next.delete(CHECK_IN_FILTER_PARAM);
  return next;
}

/** The roster's class facts (time, trial identity, date) for the show's classes. */
export function buildCheckInDeskClasses(
  trials: readonly Trial[],
  trialClasses: Readonly<
    Record<
      string,
      readonly Pick<TrialClass, 'id' | 'name' | 'element' | 'level' | 'section' | 'startTime'>[]
    >
  >
): PeopleRosterClassInfo[] {
  const resolveRing = buildTrialRingResolver(
    trials.map(trial => ({
      trialId: trial.id,
      trialName: trial.name,
      trialNumber: trial.trialNumber,
      trialDate: trial.trialDate,
    }))
  );
  return trials.flatMap(trial => {
    const ring = resolveRing({
      trialId: trial.id,
      trialName: trial.name,
      trialNumber: trial.trialNumber,
      trialDate: trial.trialDate,
    });
    return (trialClasses[trial.id] ?? []).map(cls => ({
      id: cls.id,
      name: cls.name?.trim() || `${cls.element} ${cls.level}`,
      time: cls.startTime || '',
      ...(ring ? { ring } : {}),
      trialId: trial.id,
      element: cls.element,
      level: cls.level,
      section: cls.section || '',
      trialDate: trial.trialDate || '',
      timezone: getTrialTimezone(trial),
    }));
  });
}

export function buildCheckInDeskPeople(
  entries: readonly EntryManagementEntry[],
  classes: readonly PeopleRosterClassInfo[],
  currentDate: Date
): PeopleRosterPerson[] {
  return buildPeopleRoster({ entries: [...entries], presence: [], classes, currentDate });
}

export function filterCheckInDesk(
  people: PeopleRosterPerson[],
  search: string,
  filter: CheckInDeskFilter
): PeopleRosterPerson[] {
  return filterPeopleRoster(people, search, filter === 'not-checked-in' ? 'needs-check-in' : 'all');
}

/** A desk write made but not yet read back: the status it changed from, and to. */
export interface DeskStatusChange {
  from: CheckInStatus;
  to: CheckInStatus;
}

/**
 * Optimistic until the entries re-read lands. A class shows `to` only while the shared entries
 * still say `from`: once anything else moves it (ringside, a pull, the exhibitor's own Conflict,
 * or the read-back itself) the shared value wins, even if the re-read failed and the change is
 * still held. Shared by the Check-in desk and the entry form so both show a change the same way.
 */
export function applyOptimisticDeskStatuses(
  entries: readonly EntryManagementEntry[],
  changes: ReadonlyMap<string, DeskStatusChange>
): EntryManagementEntry[] {
  if (changes.size === 0) return [...entries];
  return entries.map(entry => {
    const change = changes.get(entry.id);
    if (!change) return entry;
    return {
      ...entry,
      classes: entry.classes.map(cls =>
        (cls.checkInStatus ?? 'no-status') === change.from
          ? {
              ...cls,
              checkInStatus: change.to,
              ...(change.to === 'checked-in' ? { checkInTime: new Date() } : {}),
            }
          : cls
      ),
    };
  });
}

/** One dog's card on the desk: its armband, its class lines, and what one tap checks in. */
export interface CheckInDeskDog {
  key: string;
  dogName: string;
  armband: string | null;
  rows: PeopleRosterClassRow[];
  /** Waiting today with no status yet. A class marked Conflict is left for the secretary. */
  pendingEntryIds: string[];
}

/**
 * A person's class rows as one card per dog, in the roster's own order. A dog carrying two
 * armbands (one per trial) gets a card per armband, so the badge is never wrong for a line.
 */
export function groupCheckInDeskDogs(person: PeopleRosterPerson): CheckInDeskDog[] {
  const dogs = new Map<string, CheckInDeskDog>();
  for (const row of person.classRows) {
    const key = `${row.sourceEntry.dogId}:${row.armband ?? ''}`;
    const dog = dogs.get(key) ?? {
      key,
      dogName: row.dogName,
      armband: row.armband,
      rows: [],
      pendingEntryIds: [],
    };
    dog.rows.push(row);
    if (row.eligibleForCheckIn && row.deskStatusEditable && row.checkInStatus === 'no-status') {
      dog.pendingEntryIds.push(row.entryId);
    }
    dogs.set(key, dog);
  }
  return [...dogs.values()];
}

/** The entries with at least one class the Check-in desk would offer "Check in" for today. */
export function eligibleCheckInEntryIds(
  entries: readonly EntryManagementEntry[],
  classes: readonly PeopleRosterClassInfo[],
  currentDate: Date
): Set<string> {
  const ids = new Set<string>();
  for (const person of buildCheckInDeskPeople(entries, classes, currentDate)) {
    for (const row of person.classRows) {
      // Same gate as the desk: a scored run is finished whatever its check-in status says.
      if (row.eligibleForCheckIn && row.deskStatusEditable) ids.add(row.entryId);
    }
  }
  return ids;
}
