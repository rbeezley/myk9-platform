import type { EntryManagementEntry } from '@/types/entry-management-types';

/**
 * One label per dog on an entry form's list card, with its armband when one is assigned:
 * "Ziva #12, Juno" (MYK9-1733). An armband belongs to the dog for the whole show, so a dog
 * entered in several classes is named once, with the first armband any of its entries carries.
 */
export function entryFormDogLabels(
  entries: readonly Pick<EntryManagementEntry, 'dogId' | 'dogName' | 'armbandNumber'>[]
): string[] {
  const byDog = new Map<string, { name: string; armband: string | undefined }>();
  for (const entry of entries) {
    const key = entry.dogId || entry.dogName;
    const armband = entry.armbandNumber?.trim() || undefined;
    const seen = byDog.get(key);
    if (!seen) byDog.set(key, { name: entry.dogName, armband });
    else if (!seen.armband && armband) seen.armband = armband;
  }
  return [...byDog.values()].map(({ name, armband }) => (armband ? `${name} #${armband}` : name));
}
