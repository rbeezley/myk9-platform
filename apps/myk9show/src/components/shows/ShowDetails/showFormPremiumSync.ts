import type { GeneratedPremium } from '@/types/premium-types';

/**
 * MYK9-2213: the premium draft is built for one organization; publishing it after the show's
 * organization changed would post the old organization's text. Returns the sentence to show when
 * they differ, or null. A form without an organization keeps the saved one, so it never differs.
 */
export function premiumOrganizationMismatch(
  premium: GeneratedPremium,
  organization: string | null | undefined
): string | null {
  if (!organization || organization === premium.org) return null;
  return `The premium was built for ${premium.org}. Open Premium and Regenerate it for ${organization}, then publish.`;
}
