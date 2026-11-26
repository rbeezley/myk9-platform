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

  it('accepts the blank optional fields generate-premium returns for a sparse draft show', () => {
    // generate-premium fills these from nullable columns: shows.location,
    // pre_entry_fee / day_of_show_fee (NULLIF on an empty form field) and
    // clubs.name through a nullable club_id. The PDF templates already render
    // them as '—' / 'Host Club'; rejecting them failed the whole publish.
    const sparse = {
      ...premium,
      show: { ...premium.show, venue: null, preEntryFee: null, dayOfFee: null },
      club: { name: null, logoUrl: null },
    };

    expect(parseGeneratedPremium(sparse)).toEqual(sparse);
  });

  it('parses a stored premium that still carries the removed address and trial-limit keys', () => {
    const old = {
      ...premium,
      show: {
        ...premium.show,
        venueName: 'Hall',
        address: '1 Main',
        city: 'Ames',
        state: 'IA',
        zipCode: '50010',
      },
      trials: [
        {
          name: 'Saturday',
          date: '2026-05-01',
          startTime: null,
          eventNumber: null,
          type: 'Scent Work',
          maxTotalEntries: 37,
          judges: [],
          classes: [],
        },
      ],
    };

    const parsed = parseGeneratedPremium(old);

    expect(parsed.show.venue).toBe('Louisville');
    expect(parsed.show).not.toHaveProperty('address');
    expect(parsed.trials[0]).not.toHaveProperty('maxTotalEntries');
  });

  it('normalizes free-form accommodation entries with missing fields to empty strings', () => {
    const withLooseAccommodation = {
      ...premium,
      supplemental: {
        ...premium.supplemental,
        accommodations: [{ name: 'La Quinta' }],
      },
    };

    expect(parseGeneratedPremium(withLooseAccommodation).supplemental.accommodations).toEqual([
      { name: 'La Quinta', address: '', phone: '' },
    ]);
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

  it('accepts a judge published before residence and classes existed and defaults both (MYK9-2067)', () => {
    const parsed = parseGeneratedPremium({
      ...premium,
      trials: [
        {
          name: 'Sat',
          date: '2026-05-01',
          startTime: null,
          eventNumber: null,
          type: 'Scent Work',
          judges: [{ name: 'Old Judge', elements: ['Container'] }],
          classes: [],
        },
      ],
    });
    expect(parsed.trials[0]?.judges).toEqual([{ name: 'Old Judge', residence: null, classes: [] }]);
  });

  it("keeps a judge's residence and classes", () => {
    const judge = {
      name: 'Jane Smith',
      residence: 'Springfield, IL',
      classes: ['Container Novice'],
    };
    const parsed = parseGeneratedPremium({
      ...premium,
      trials: [
        {
          name: 'Sat',
          date: '2026-05-01',
          startTime: null,
          eventNumber: null,
          type: 'Scent Work',
          judges: [judge],
          classes: [],
        },
      ],
    });
    expect(parsed.trials[0]?.judges).toEqual([judge]);
  });
});
