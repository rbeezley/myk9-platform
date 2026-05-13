export interface DogRegistrationBreedLike {
  organization?: string | null | undefined;
  breed?: string | null | undefined;
}

export function organizationMatches(
  registrationOrganization: string,
  showOrganization: string
): boolean {
  const registration = registrationOrganization.toLowerCase();
  const show = showOrganization.toLowerCase();
  return registration === show || registration.includes(show) || show.includes(registration);
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
