import { loadDogRegistrations } from '@/services/database/dogs/reads';
import type { ReportDbEntry } from '@/lib/reports/types';

/**
 * The one registration join for printed sheets: each entry's dog gets its registrations
 * (`loadDogRegistrations`: server first, the device copy offline). Reports and the class card's
 * print fingerprint (`usePrintedSheetEntries`) both call this, so they cannot disagree on which
 * registration number a sheet prints (MYK9-2103).
 */
export async function attachDogRegistrations(
  entries: ReportDbEntry[]
): Promise<{ entries: ReportDbEntry[]; registrationsReadComplete: boolean }> {
  const dogIds = [
    ...new Set(entries.map(entry => entry.dog_id).filter((id): id is string => Boolean(id))),
  ];
  if (dogIds.length === 0) return { entries, registrationsReadComplete: true };

  const { byDog, registrationsReadComplete } = await loadDogRegistrations(dogIds);

  return {
    entries: entries.map(entry => {
      if (!entry.dog_id) return entry;
      const dog = entry.dog ?? { id: entry.dog_id };
      return {
        ...entry,
        dog: {
          ...dog,
          registrations: byDog.get(entry.dog_id) ?? [],
        },
      };
    }),
    registrationsReadComplete,
  };
}
