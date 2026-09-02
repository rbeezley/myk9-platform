/**
 * Pure view-model for a dog card's registry table (My Dogs rail + /dogs grid).
 *
 * Breed lives on `dog_registrations`, one row per registry. Most dogs carry the
 * same breed at every registry, so the card names it ONCE; when registries
 * disagree (AKC "All-American Dog" vs UKC "Mixed Breed") each row shows its own.
 */

/** Accepts both the raw `dog_registrations` row and the mapped `Registration`. */
export interface DogCardRegistration {
  breed?: string | null;
  organization?: string | null;
  registration_number?: string | null;
  registrationNumber?: string | null;
}

export interface DogCardRegistryRow {
  org: string;
  breed: string | null;
  number: string | null;
}

export interface DogCardRegistryModel {
  /** The one breed every registry agrees on, or null when they differ / none. */
  breed: string | null;
  /** True when at least two registries record different breeds. */
  breedVaries: boolean;
  rows: DogCardRegistryRow[];
}

/** "AKC - American Kennel Club" → "AKC"; mirrors the strip's prior labelling. */
export function registryAbbreviation(organization: string | null | undefined): string {
  return organization?.trim().split(' ')[0] ?? '';
}

export function buildDogCardRegistryModel(
  registrations: DogCardRegistration[] | null | undefined
): DogCardRegistryModel {
  const rows: DogCardRegistryRow[] = [];
  const seen = new Set<string>();
  for (const r of registrations ?? []) {
    const org = registryAbbreviation(r.organization);
    const number = (r.registration_number ?? r.registrationNumber)?.trim() || null;
    const breed = r.breed?.trim() || null;
    if (!org && !number && !breed) continue;
    const key = `${org}|${number ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ org, breed, number });
  }

  const breeds = new Set(rows.map(r => r.breed).filter((b): b is string => !!b));
  const breedVaries = breeds.size > 1;
  return {
    breed: breeds.size === 1 ? [...breeds][0] : null,
    breedVaries,
    rows,
  };
}
