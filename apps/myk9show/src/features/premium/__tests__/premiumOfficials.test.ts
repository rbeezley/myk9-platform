import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchShowOfficials: vi.fn() }));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  fetchShowOfficials: mocks.fetchShowOfficials,
}));

import { generatedPremium } from './fixtures/generatedPremium';
import { applyOfficialsToPremium, fetchOfficialsForPublish } from '../premiumOfficials';
import { PremiumPublishError } from '../premiumPublishErrors';
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

  it('clears the whole contact of a role nobody holds, so a former volunteer prints nothing', () => {
    const draft = generatedPremium();
    draft.secretary = {
      name: 'Old Sec',
      email: 'old-sec@example.com',
      phone: '9185550000',
      mailingAddress: '1 Home St',
    };
    draft.officials = {
      chairman: {
        name: 'Old Chair',
        email: 'old-chair@example.com',
        phone: '9185550001',
        mailingAddress: '2 Home St',
      },
    };
    const premium = applyOfficialsToPremium(draft, { secretaries: [], chairmen: [], stewards: [] });

    expect(premium.secretary).toEqual({
      name: null,
      email: null,
      phone: null,
      mailingAddress: null,
    });
    expect(premium.officials.chairman).toBeNull();
  });

  it('prints no draft phone for a replaced secretary or chair (MYK9-2204)', () => {
    const draft = generatedPremium();
    draft.secretary = {
      name: 'Old Sec',
      email: 'old-sec@example.com',
      phone: '9185550000',
      mailingAddress: null,
    };
    draft.officials = {
      chairman: {
        name: 'Old Chair',
        email: 'old-chair@example.com',
        phone: '9185550001',
        mailingAddress: null,
      },
    };
    const premium = applyOfficialsToPremium(draft, {
      secretaries: [official('secretary', 'Sam', null)],
      chairmen: [official('chairman', 'Cara', null)],
      stewards: [],
    });

    expect(premium.secretary.name).toBe('Sam Person');
    expect(premium.secretary.phone).toBeNull();
    expect(premium.officials.chairman?.name).toBe('Cara Person');
    expect(premium.officials.chairman?.phone).toBeNull();
  });

  it('keeps the draft only when the officials could not be read: the publish fails instead', async () => {
    mocks.fetchShowOfficials.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchOfficialsForPublish('show-1')).rejects.toBeInstanceOf(PremiumPublishError);
  });
});
