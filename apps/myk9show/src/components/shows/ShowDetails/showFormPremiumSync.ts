import type { GeneratedPremium } from '@/types/premium-types';

/**
 * MYK9-2216: changing the sanctioning organization invalidates the stored premium. It cannot be
 * published until it is regenerated for the new organization, so a premium built for any other
 * organization is refused here. A form without an organization keeps the saved one.
 */
export function premiumOrganizationMismatch(
  premium: GeneratedPremium,
  organization: string | null | undefined
): string | null {
  if (!organization || organization === premium.org) return null;
  return 'Regenerate the premium for the new organization before publishing.';
}
