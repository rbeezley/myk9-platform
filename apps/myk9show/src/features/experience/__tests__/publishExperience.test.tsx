import { describe, expect, it, vi } from 'vitest';
import { publishExperience } from '../publishExperience';

vi.mock('@/features/premium/publishPremium', () => ({
  publishPremium: vi.fn(async () => ({
    url: 'https://example.com/show.pdf',
    publishedAt: '2026-05-09T14:00:00.000Z',
  })),
}));

const update = vi.fn(() => ({
  eq: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ update })),
  },
}));

describe('publishExperience', () => {
  it('publishes premium and writes the published experience snapshot', async () => {
    await publishExperience({
      showId: 'show-1',
      premium: {
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
        officials: { chairman: null, steward: null },
        trials: [],
        supplemental: {
          vetClinic: null,
          accommodations: [],
          hospitalityNotes: 'Coffee provided.',
          awardsDescription: null,
          additionalNotes: null,
        },
        narratives: {
          showHours: 'Doors open at 7:00 AM.',
          trialInformation: 'Trial briefing at 8:00 AM.',
        },
      },
      inkSaver: false,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        experience_is_published: true,
        experience_published_at: '2026-05-09T14:00:00.000Z',
        experience_published_style: 'heritage',
        experience_published_content: expect.objectContaining({
          style: 'heritage',
          outputs: { premiumUrl: 'https://example.com/show.pdf' },
        }),
      })
    );
  });
});
