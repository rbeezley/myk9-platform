import { describe, expect, it, vi } from 'vitest';
import { publishExperience } from '../publishExperience';
import { PremiumPublishError } from '../../premium/premiumPublishErrors';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: Error | null }> => ({
    data: { premiumPath: 'show-1/artifact-1.pdf', publishedAt: '2026-05-09T15:00:00.000Z' },
    error: null as Error | null,
  })),
}));

vi.mock('@/features/premium/publishPremium', () => ({
  publishPremium: vi.fn(async () => ({
    path: 'show-1/artifact-1.pdf',
    url: 'https://example.com/show.pdf',
    publishedAt: '2026-05-09T14:00:00.000Z',
  })),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: mocks.rpc,
  },
}));

describe('publishExperience', () => {
  it('publishes premium and writes the published experience snapshot', async () => {
    const result = await publishExperience({
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
        officials: { chairman: null },
        trials: [],
        supplemental: {
          vetClinic: null,
          accommodations: [],
          coverImageUrl: null,
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
      publishVersion: 1,
    });

    expect(result.publishedAt).toBe('2026-05-09T15:00:00.000Z');

    expect(mocks.rpc).toHaveBeenCalledWith('publish_premium_artifact', {
      p_show_id: 'show-1',
      p_storage_path: 'show-1/artifact-1.pdf',
      p_publish_version: 1,
      p_experience_style: 'heritage',
      p_experience_content: expect.objectContaining({
        style: 'heritage',
        outputs: { premiumPath: 'show-1/artifact-1.pdf', premiumUrl: null },
      }),
    });
  });

  it('treats a failed atomic commit as partial progress so retry can reuse the staged artifact', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('snapshot write failed') });

    await expect(
      publishExperience({
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
          narratives: { showHours: 'Hours', trialInformation: 'Info' },
        },
        inkSaver: false,
        publishVersion: 1,
      })
    ).rejects.toMatchObject<Partial<PremiumPublishError>>({ stage: 'experience-snapshot' });
  });

  it('treats a zero-row atomic commit as failure', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });

    await expect(
      publishExperience({
        showId: 'show-1',
        premium: {
          org: 'AKC',
          style: 'heritage',
          templateId: null,
          show: {
            name: 'Bluegrass Classic',
            startDate: '2026-05-01',
            endDate: '2026-05-02',
            venue: '',
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
          narratives: { showHours: 'Hours', trialInformation: 'Info' },
        },
        inkSaver: false,
        publishVersion: 1,
      })
    ).rejects.toMatchObject<Partial<PremiumPublishError>>({ stage: 'experience-snapshot' });
  });
});
