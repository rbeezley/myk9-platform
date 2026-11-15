// What a full confirmation says about the show's registry (MYK9-1999). Deno-free.
//
// Mirrors the Registry configs in apps/myk9show/src/features/registries (akc.ts, ukc.ts,
// asca.ts): Deno cannot import from apps/. registryLanguage.test.ts compares every field with
// those configs, so a change there fails here. A show has one registry (owner rule): its
// trials' registry_id, read as getTrialRegistry reads it (blank or unknown means AKC).

export interface RegistryEmailLanguage {
  id: 'AKC' | 'UKC' | 'ASCA';
  shortName: string;
  licenseLanguage: string;
  memberClubLanguage: string;
}

const REGISTRY_LANGUAGE: Record<RegistryEmailLanguage['id'], RegistryEmailLanguage> = {
  AKC: {
    id: 'AKC',
    shortName: 'A.K.C.',
    licenseLanguage: 'An A.K.C. Licensed Trial',
    memberClubLanguage: 'A member club of the American Kennel Club',
  },
  UKC: {
    id: 'UKC',
    shortName: 'UKC',
    licenseLanguage: 'A UKC Licensed Nosework Trial',
    memberClubLanguage: 'Held under the Official Rules and Regulations of the United Kennel Club',
  },
  ASCA: {
    id: 'ASCA',
    shortName: 'ASCA',
    licenseLanguage: 'An ASCA Sanctioned Scent Detection Trial',
    memberClubLanguage: 'Sanctioned by The Australian Shepherd Club of America',
  },
};

export const REGISTRY_EMAIL_LANGUAGE_IDS = Object.keys(
  REGISTRY_LANGUAGE
) as RegistryEmailLanguage['id'][];

/** The language for a trial's registry_id; blank or unknown is AKC, as getTrialRegistry has it. */
export function registryEmailLanguage(
  registryId: string | null | undefined
): RegistryEmailLanguage {
  const id = registryId?.trim() ?? '';
  return REGISTRY_LANGUAGE[id as RegistryEmailLanguage['id']] ?? REGISTRY_LANGUAGE.AKC;
}
