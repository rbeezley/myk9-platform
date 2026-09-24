import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PremiumPublishAttempt } from '@/features/premium/premiumPublishIntent';
import { publishExperience } from '../publishExperience';
import { PremiumPublishError } from '../../premium/premiumPublishErrors';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: Error | null }> => ({
    data: {
      premiumPath: 'show-1/artifact-1.pdf',
      premiumUrl:
        'https://test.supabase.co/storage/v1/object/public/premium-published/show-1/artifact-1.pdf',
      publishedAt: '2026-05-09T15:00:00.000Z',
    },
    error: null as Error | null,
  })),
  upload: vi.fn(async () => ({
    path: 'show-1/artifact-1.pdf',
  })),
}));

vi.mock('@/features/premium/publishPremium', () => ({
  publishPremium: mocks.upload,
}));

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));

const attempt: PremiumPublishAttempt = {
  schemaVersion: 4,
  mode: 'generated',
  intentKey: 'generated-current-sources',
  showId: 'show-1',
  publisherId: 'user-1',
  fingerprint: 'complete-intent',
  intent: {
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
      narratives: { showHours: 'Doors open at 7:00 AM.', trialInformation: 'Briefing at 8:00 AM.' },
    },
    inkSaver: true,
  },
  artifactId: 'artifact-1',
  publishVersion: 1,
};

describe('publishExperience', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({
      data: {
        premiumPath: 'show-1/artifact-1.pdf',
        premiumUrl:
          'https://test.supabase.co/storage/v1/object/public/premium-published/show-1/artifact-1.pdf',
        publishedAt: '2026-05-09T15:00:00.000Z',
      },
      error: null,
    });
    mocks.upload.mockReset();
    mocks.upload.mockResolvedValue({
      path: 'show-1/artifact-1.pdf',
    });
  });

  it('stages and atomically commits the exact path, URL and snapshot', async () => {
    const result = await publishExperience({ showId: 'show-1', attempt });

    expect(result).toEqual({
      publishedAt: '2026-05-09T15:00:00.000Z',
      premiumUrl: `${(import.meta.env.VITE_SUPABASE_URL || 'https://sojmvhhwsjxmfistvzbe.supabase.co').replace(/\/$/, '')}/storage/v1/object/public/premium-published/show-1/artifact-1.pdf`,
    });
    expect(mocks.upload).toHaveBeenCalledWith('show-1', attempt.intent.premium, {
      artifactId: 'artifact-1',
      inkSaver: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('publish_premium_artifact', {
      p_show_id: 'show-1',
      p_storage_path: 'show-1/artifact-1.pdf',
      p_public_url: `${(import.meta.env.VITE_SUPABASE_URL || 'https://sojmvhhwsjxmfistvzbe.supabase.co').replace(/\/$/, '')}/storage/v1/object/public/premium-published/show-1/artifact-1.pdf`,
      p_publish_version: 1,
      p_experience_style: 'heritage',
      p_experience_content: expect.objectContaining({
        style: 'heritage',
        outputs: {
          premiumPath: 'show-1/artifact-1.pdf',
          premiumUrl: `${(import.meta.env.VITE_SUPABASE_URL || 'https://sojmvhhwsjxmfistvzbe.supabase.co').replace(/\/$/, '')}/storage/v1/object/public/premium-published/show-1/artifact-1.pdf`,
        },
      }),
    });
  });

  it('retains staged bytes when the atomic commit fails so the identical attempt can retry', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('snapshot write failed') });
    await expect(publishExperience({ showId: 'show-1', attempt })).rejects.toMatchObject<
      Partial<PremiumPublishError>
    >({ stage: 'experience-snapshot' });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it('treats a zero-row atomic commit as failure', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(publishExperience({ showId: 'show-1', attempt })).rejects.toMatchObject<
      Partial<PremiumPublishError>
    >({ stage: 'experience-snapshot' });
  });
});
