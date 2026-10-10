/**
 * The breed shown on a LIVE scoresheet (MYK9-1086), held to the same rule as
 * paper (MYK9-90): only the dog's registered breed for this class's registry,
 * never `dogs.breed` borrowed from another registry.
 *
 * Unlike paper, a live sheet must open instantly and offline, so this resolves
 * in the background and answers `null` whenever the breed cannot be confirmed
 * (no registry cached, no registration for it, or the read failed). The caller
 * shows no breed until a confirmed one arrives.
 */
import { loadClassRegistryForClass, loadRegisteredBreedsByDogId } from './paperScoresheetData';

export async function resolveLiveScoringBreed(
  classId: string,
  dogId: string | null | undefined
): Promise<string | null> {
  if (!dogId) return null;
  try {
    const registry = await loadClassRegistryForClass(classId);
    if (!registry) return null;
    const breeds = await loadRegisteredBreedsByDogId([dogId], registry);
    return breeds.get(dogId) || null;
  } catch {
    return null;
  }
}
