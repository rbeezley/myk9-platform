import { loadCatalogDogProfiles } from '@/services/database/dogs/catalogProfiles';
import type { ReportDbEntry } from '@/lib/reports/types';

/**
 * MYK9-1009: attach each dog's date of birth and its owner's name and mailing
 * address, which the AKC marked catalog prints inline with the entry.
 *
 * `readComplete` is false when any batch failed: the host then tells the reader the
 * catalog is incomplete instead of letting a blank cell pass for "no data".
 *
 * Deliberately ANCILLARY: a dog the read did not answer for keeps its entry row
 * untouched, so the catalog prints those fields blank instead of refusing to
 * print. Nothing is inferred from the call name or the handler.
 */
export async function hydrateCatalogDogProfiles(
  entries: ReportDbEntry[]
): Promise<{ entries: ReportDbEntry[]; readComplete: boolean }> {
  const dogIds = entries.map(entry => entry.dog_id).filter((id): id is string => Boolean(id));
  if (dogIds.length === 0) return { entries, readComplete: true };

  const { byDogId, readComplete } = await loadCatalogDogProfiles(dogIds);
  if (byDogId.size === 0) return { entries, readComplete };

  const hydrated = entries.map(entry => {
    const profile = entry.dog_id ? byDogId.get(entry.dog_id) : undefined;
    if (!profile || !entry.dog_id) return entry;
    const dog = entry.dog ?? { id: entry.dog_id };
    return {
      ...entry,
      dog: {
        ...dog,
        ...(profile.dateOfBirth ? { date_of_birth: profile.dateOfBirth } : {}),
        ...(profile.owner
          ? {
              owner: {
                ...dog.owner,
                first_name: profile.owner.firstName ?? dog.owner?.first_name ?? null,
                last_name: profile.owner.lastName ?? dog.owner?.last_name ?? null,
                street_address: profile.owner.streetAddress,
                city: profile.owner.city,
                state: profile.owner.state,
                zip_code: profile.owner.zipCode,
              },
            }
          : {}),
      },
    };
  });
  return { entries: hydrated, readComplete };
}
