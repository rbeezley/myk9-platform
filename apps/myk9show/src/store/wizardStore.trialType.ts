import { getRegistrySportName, listRegistries } from '@/features/registries';

/** Maps show organization to a default trial type (discipline); undefined for an unknown org. */
export function defaultTrialType(organization: string): string | undefined {
  const id = organization.trim().toUpperCase();
  return (listRegistries() as string[]).includes(id) ? getRegistrySportName(id) : undefined;
}
