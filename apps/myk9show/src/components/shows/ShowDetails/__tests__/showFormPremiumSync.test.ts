import { describe, expect, it } from 'vitest';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import { premiumOrganizationMismatch } from '../showFormPremiumSync';

describe('premiumOrganizationMismatch (MYK9-2216)', () => {
  it('refuses a premium built for another organization', () => {
    expect(premiumOrganizationMismatch(generatedPremium(), 'UKC')).toBe(
      'Regenerate the premium for the new organization before publishing.'
    );
  });

  it('is null when they agree or the form carries no organization', () => {
    expect(premiumOrganizationMismatch(generatedPremium(), 'AKC')).toBeNull();
    expect(premiumOrganizationMismatch(generatedPremium(), undefined)).toBeNull();
  });
});
