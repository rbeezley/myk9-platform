/**
 * The ONE identifying detail each delete dialog shows under its title, so the
 * secretary can tell "the show Heartland Classic" from last year's show of the
 * same name before pressing Delete. One builder per object keeps the format the
 * same on every surface that deletes it.
 */
import { formatTrialLabel } from '@myk9/core';
import { formatShortDate, formatShowDateRange } from '@/lib/format/dates';

type Part = string | null | undefined;

function joinParts(parts: readonly Part[]): string | undefined {
  const present = parts.map(part => part?.trim()).filter((part): part is string => !!part);
  return present.length > 0 ? present.join(' · ') : undefined;
}

/** Show: dates + club. */
export function showDeleteDetail(show: {
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  clubName?: string | null | undefined;
}): string | undefined {
  return joinParts([formatShowDateRange(show.startDate, show.endDate), show.clubName]);
}

/** Trial: its label + its date. */
export function trialDeleteDetail(trial: {
  name?: string | null | undefined;
  trialNumber?: string | number | null | undefined;
  date?: string | null | undefined;
}): string | undefined {
  return joinParts([
    formatTrialLabel({ name: trial.name, trialNumber: trial.trialNumber }),
    trial.date ? formatShortDate(trial.date) : undefined,
  ]);
}

/** Class: level + element + the trial it is in. */
export function classDeleteDetail(cls: {
  level?: string | null | undefined;
  element?: string | null | undefined;
  trialLabel?: string | null | undefined;
}): string | undefined {
  const levelElement = [cls.level, cls.element]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ');
  return joinParts([levelElement, cls.trialLabel]);
}

/** Entry: dog call name + handler + class. */
export function entryDeleteDetail(entry: {
  callName?: string | null | undefined;
  handlerName?: string | null | undefined;
  className?: string | null | undefined;
}): string | undefined {
  return joinParts([
    entry.callName,
    entry.handlerName ? `handled by ${entry.handlerName}` : undefined,
    entry.className,
  ]);
}

/** Dog: call name + owner. */
export function dogDeleteDetail(dog: {
  callName?: string | null | undefined;
  ownerName?: string | null | undefined;
}): string | undefined {
  return joinParts([dog.callName, dog.ownerName ? `owned by ${dog.ownerName}` : undefined]);
}

/** Person: name + email, or town when there is no email. */
export function personDeleteDetail(person: {
  name?: string | null | undefined;
  email?: string | null | undefined;
  town?: string | null | undefined;
}): string | undefined {
  return joinParts([person.name, person.email || person.town]);
}

/** Club: name + city. */
export function clubDeleteDetail(club: {
  name?: string | null | undefined;
  city?: string | null | undefined;
}): string | undefined {
  return joinParts([club.name, club.city]);
}
