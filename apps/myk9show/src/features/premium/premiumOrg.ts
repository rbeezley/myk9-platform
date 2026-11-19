import type { GeneratedPremium } from '@/types/premium-types';

/** The show's saved organization when premium generation supports it (AKC, UKC, ASCA), else null. */
export function premiumOrgOf(
  organization: string | null | undefined
): GeneratedPremium['org'] | null {
  return organization === 'AKC' || organization === 'UKC' || organization === 'ASCA'
    ? organization
    : null;
}
