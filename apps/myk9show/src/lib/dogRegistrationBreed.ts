export interface DogRegistrationBreedLike {
  organization?: string | null | undefined;
  breed?: string | null | undefined;
}

const ORGANIZATION_ALIASES: Record<string, string> = {
  'AMERICAN KENNEL CLUB': 'AKC',
  'UNITED KENNEL CLUB': 'UKC',
  'FEDERATION CYNOLOGIQUE INTERNATIONALE': 'FCI',
};

function normalizeOrganization(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, ' ');
  return ORGANIZATION_ALIASES[normalized] ?? normalized;
}

export function organizationMatches(
  registrationOrganization: string,
  showOrganization: string
): boolean {
  return normalizeOrganization(registrationOrganization) === normalizeOrganization(showOrganization);
}

export function getRegisteredBreedForOrganization(
  registrations: DogRegistrationBreedLike[],
  organization: string | undefined
): string | undefined {
  if (!organization) return undefined;
  const match = registrations.find(registration => {
    if (!registration.organization) return false;
    return organizationMatches(registration.organization, organization);
  });
  return match?.breed ?? undefined;
}
