import { describe, expect, it } from 'vitest';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import { premiumOrganizationMismatch } from '../showFormPremiumSync';

describe('premiumOrganizationMismatch (MYK9-2213)', () => {
  it('names both organizations when the draft was built for another one', () => {
    expect(premiumOrganizationMismatch(generatedPremium(), 'UKC')).toBe(
      'The premium was built for AKC. Open Premium and Regenerate it for UKC, then publish.'
    );
  });

  it('is null when they agree or the form carries no organization', () => {
    expect(premiumOrganizationMismatch(generatedPremium(), 'AKC')).toBeNull();
    expect(premiumOrganizationMismatch(generatedPremium(), undefined)).toBeNull();
  });
});
