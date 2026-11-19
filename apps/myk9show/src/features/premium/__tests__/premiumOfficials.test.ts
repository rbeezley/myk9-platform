import { describe, expect, it } from 'vitest';
import { generatedPremium } from './fixtures/generatedPremium';
import { applyOfficialsToPremium } from '../premiumOfficials';
import type { ShowOfficial } from '@/hooks/queries/useShowOfficials';

const official = (
  role: ShowOfficial['role'],
  firstName: string,
  mailingAddress: string | null
): ShowOfficial => ({
  personId: `${role}-1`,
  firstName,
  lastName: 'Person',
  email: `${firstName.toLowerCase()}@example.com`,
  mailingAddress,
  role,
});

describe('applyOfficialsToPremium mailing addresses (MYK9-2065)', () => {
  it('puts the address typed on each show official into the premium', () => {
    const premium = applyOfficialsToPremium(generatedPremium(), {
      secretaries: [official('secretary', 'Sam', 'PO Box 9')],
      chairmen: [official('chairman', 'Cara', 'PO Box 77')],
      stewards: [],
    });

    expect(premium.secretary.mailingAddress).toBe('PO Box 9');
    expect(premium.officials.chairman?.mailingAddress).toBe('PO Box 77');
  });

  it('prints no address for an official who has none, not the premium earlier value', () => {
    const stale = generatedPremium();
    stale.secretary.mailingAddress = '1 Old Home St';
    const premium = applyOfficialsToPremium(stale, {
      secretaries: [official('secretary', 'Sam', null)],
      chairmen: [official('chairman', 'Cara', null)],
      stewards: [],
    });

    expect(premium.secretary.mailingAddress).toBeNull();
    expect(premium.officials.chairman?.mailingAddress).toBeNull();
  });
});
