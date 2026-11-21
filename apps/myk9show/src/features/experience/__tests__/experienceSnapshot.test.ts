import { describe, expect, it } from 'vitest';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import { buildExperienceSnapshot, getLiveExperienceSnapshot } from '../experienceSnapshot';

describe('experienceSnapshot', () => {
  it('builds a published snapshot from generated premium data and trusted path', () => {
    const snapshot = buildExperienceSnapshot({
      premium: {
        org: 'UKC',
        style: 'heritage',
        show: { startDate: '2026-05-01' },
        trials: [],
        narratives: {
          showHours: 'Doors open at 7:00 AM.',
          trialInformation: 'Trial briefing at 8:00 AM.',
        },
        supplemental: {
          vetClinic: null,
          accommodations: [],
          coverImageUrl: null,
          hospitalityNotes: 'Coffee provided.',
          awardsDescription: null,
          additionalNotes: null,
        },
      },
      premiumPath: 'show-1/artifact-1.pdf',
      premiumUrl: 'https://trusted.example/premium-published/show-1/artifact-1.pdf',
    });

    // MYK9-2216: the snapshot records the organization it was built for.
    expect(snapshot.org).toBe('UKC');
    expect(snapshot.style).toBe('heritage');
    expect(snapshot.outputs.premiumPath).toBe('show-1/artifact-1.pdf');
    expect(snapshot.outputs.premiumUrl).toBe(
      'https://trusted.example/premium-published/show-1/artifact-1.pdf'
    );
    expect(snapshot.narratives.showHours).toBe('Doors open at 7:00 AM.');
    // MYK9-2044: a UKC premium states no recording fee.
    expect(snapshot.recordingFee).toBeNull();
  });

  it('never stores the full premium (officials contact details) on the show row (MYK9-2230)', () => {
    const premium = generatedPremium();
    premium.secretary = {
      name: 'Jane Smith',
      email: 'jane@test.com',
      phone: '555-0100',
      mailingAddress: '1 Main St',
    };
    const snapshot = buildExperienceSnapshot({ premium, premiumPath: 'p.pdf', premiumUrl: 'u' });

    expect(snapshot).not.toHaveProperty('premium');
    expect(JSON.stringify(snapshot)).not.toContain('jane@test.com');
    expect(JSON.stringify(snapshot)).not.toContain('555-0100');
  });

  it('returns published snapshot only when the show is published', () => {
    const snapshot = {
      style: 'heritage' as const,
      generatedAt: '2026-05-09T14:00:00.000Z',
      narratives: { showHours: 'Hours', trialInformation: 'Info' },
      supplemental: {
        vetClinic: null,
        accommodations: [],
        coverImageUrl: null,
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      outputs: { premiumUrl: null },
    };

    expect(
      getLiveExperienceSnapshot({
        experienceIsPublished: true,
        experiencePublishedContent: snapshot,
      })
    ).toBe(snapshot);

    expect(
      getLiveExperienceSnapshot({
        experienceIsPublished: false,
        experiencePublishedContent: snapshot,
      })
    ).toBeNull();
  });
});
