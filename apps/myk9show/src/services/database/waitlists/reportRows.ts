/**
 * Waitlist rows for the Waitlist Report (MYK9-717).
 *
 * Built on the SAME replication-first reads the Entries → Waitlist tab uses
 * (`getClassesWithWaitlistCounts` + `getWaitlistByClass`), so the printed
 * report and the screen can never disagree about who is waiting or in what
 * order. The handler is `waitlist_entries.handler_id`, falling back to the
 * dog's owner when the exhibitor named no handler, resolved through the same
 * offline-aware people hydration the entry reads use.
 */
import type { ReportWaitlistRow } from '@/lib/reports/types';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { loadHandlerPeople } from '../entries/handlerHydration';
import { getClassesWithWaitlistCounts, getWaitlistByClass } from './reads';

function personName(person: { first_name?: string | null; last_name?: string | null } | undefined) {
  if (!person) return null;
  return [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || null;
}

export async function getWaitlistReportRows(showId: string): Promise<ReportWaitlistRow[]> {
  const classes = await getClassesWithWaitlistCounts(showId);
  if (classes.error) throw classes.error;

  const waitlistClassIds = classes.data.filter(c => c.waitlist_count > 0).map(c => c.id);
  const perClass = await Promise.all(waitlistClassIds.map(id => getWaitlistByClass(id)));
  const failed = perClass.find(result => result.error);
  if (failed?.error) throw failed.error;
  const entries = perClass.flatMap(result => result.data);
  if (entries.length === 0) return [];

  const dogIds = [...new Set(entries.map(e => e.dog_id))];
  const dogs = await Promise.all(dogIds.map(id => replicatedDogsTable.getDogById(id)));
  const ownerByDog = new Map(dogIds.map((id, i) => [id, dogs[i]?.ownerId ?? null] as const));

  const personIdFor = (entry: (typeof entries)[number]) =>
    entry.handler_id ?? ownerByDog.get(entry.dog_id) ?? null;
  const people = await loadHandlerPeople(
    entries.map(personIdFor).filter((id): id is string => Boolean(id))
  );

  return entries.map(entry => {
    const personId = personIdFor(entry);
    return {
      id: entry.id,
      classId: entry.class_id,
      position: entry.position,
      callName: entry.dog?.call_name || entry.dog?.name || 'Unknown dog',
      handler: personId ? personName(people.get(personId)) : null,
    };
  });
}
