import { describe, expect, it } from 'vitest';
import { parseGeneratedPremium, parsePersistedPremiumAttempt } from './premiumPublishSchema';

const premium = {
  org: 'AKC',
  style: 'heritage',
  templateId: null,
  show: {
    name: 'Bluegrass Classic',
    startDate: '2026-05-01',
    endDate: '2026-05-02',
    venue: 'Louisville',
    entryOpenDate: null,
    entryCloseDate: null,
    preEntryFee: 25,
    dayOfFee: 30,
    acceptChecks: false,
    acceptCash: false,
  },
  club: { name: 'Bluegrass KC', logoUrl: null },
  secretary: { name: null, email: null, phone: null, mailingAddress: null },
  officials: { chairman: null },
  trials: [],
  supplemental: {
    vetClinic: null,
    accommodations: [],
    coverImageUrl: null,
    hospitalityNotes: null,
    awardsDescription: null,
    additionalNotes: null,
  },
  narratives: { showHours: 'Doors open at 7.', trialInformation: 'Briefing at 8.' },
};

describe('premium publication schemas', () => {
  it('accepts complete generated premium data and rejects incomplete nested data', () => {
    expect(parseGeneratedPremium(premium)).toEqual(premium);
    expect(() => parseGeneratedPremium({})).toThrow();
    expect(() => parseGeneratedPremium({ ...premium, trials: [{ judges: [{}] }] })).toThrow();
  });

  it('accepts only a complete current-schema persisted attempt', () => {
    const attempt = {
      schemaVersion: 4,
      mode: 'generated',
      intentKey: 'generated-current-sources',
      showId: 'show-1',
      publisherId: 'user-1',
      fingerprint: 'stable-intent',
      intent: { premium, inkSaver: true },
      artifactId: 'artifact-1',
      publishVersion: 7,
    };
    expect(parsePersistedPremiumAttempt(attempt)).toEqual(attempt);
    expect(parsePersistedPremiumAttempt({ ...attempt, schemaVersion: 1 })).toBeNull();
    expect(parsePersistedPremiumAttempt({ ...attempt, fingerprint: '' })).toBeNull();
  });
});
