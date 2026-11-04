/**
 * Pure logic for Entry Forms' "Check-in desk" view (MYK9-1689). Row building, eligibility and
 * search are the People roster's own (`peopleRoster.ts`), imported rather than copied, so the
 * two cannot disagree about who can be checked in or what a search matches.
 */
import {
  buildPeopleRoster,
  filterPeopleRoster,
  type PeopleRosterClassInfo,
  type PeopleRosterPerson,
} from '@/components/entries/management/checkInDesk/peopleRoster';
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
