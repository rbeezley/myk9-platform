import { describe, expect, it } from 'vitest';
import { buildExperienceSnapshot, getLiveExperienceSnapshot } from '../experienceSnapshot';

describe('experienceSnapshot', () => {
  it('builds a published snapshot from generated premium data and trusted path', () => {
    const snapshot = buildExperienceSnapshot({
      premium: {
        style: 'heritage',
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

    expect(snapshot.style).toBe('heritage');
    expect(snapshot.outputs.premiumPath).toBe('show-1/artifact-1.pdf');
    expect(snapshot.outputs.premiumUrl).toBe(
      'https://trusted.example/premium-published/show-1/artifact-1.pdf'
    );
    expect(snapshot.narratives.showHours).toBe('Doors open at 7:00 AM.');
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
