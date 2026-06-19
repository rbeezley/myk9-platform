import type { EntryManagementEntry } from '@/types/entry-management-types';

export interface EnrollmentDogGroup {
  dogKey: string;
  dogName: string;
  entries: EntryManagementEntry[];
}

export function groupEnrollmentEntriesByDog(entries: EntryManagementEntry[]): EnrollmentDogGroup[] {
  const groups = new Map<string, EnrollmentDogGroup>();

  entries.forEach(entry => {
    const dogKey = entry.dogId || entry.dogName || entry.id;
    const existing = groups.get(dogKey);

    if (existing) {
      existing.entries.push(entry);
      return;
    }

    groups.set(dogKey, {
      dogKey,
      dogName: entry.dogName || 'Unknown dog',
      entries: [entry],
    });
  });

  return Array.from(groups.values());
}
