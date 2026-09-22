import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import { publishExperienceLegacy } from '../publishExperienceLegacy';

const mocks = vi.hoisted(() => ({
  render: vi.fn(async () => new Blob(['pdf'])),
  upload: vi.fn(async () => ({ error: null })),
  getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://trusted.test/show-1.pdf' } })),
  update: vi.fn(),
}));

vi.mock('@/features/premium/publishPremium', () => ({ renderPremiumPdf: mocks.render }));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }),
    },
    from: () => ({ update: mocks.update }),
  },
}));

describe('publishExperienceLegacy', () => {
  beforeEach(() => {
    mocks.render.mockClear();
    mocks.upload.mockReset();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockClear();
    mocks.update.mockReset();
    mocks.update.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
  });

  it('keeps the old flat upsert and writes the latest URL and experience snapshot', async () => {
    const result = await publishExperienceLegacy({
      showId: 'show-1',
      intent: { premium: generatedPremium(), inkSaver: true },
    });

    expect(mocks.render).toHaveBeenCalledWith('show-1', generatedPremium(), true);
    expect(mocks.upload).toHaveBeenCalledWith('show-1.pdf', expect.any(Blob), {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    });
    expect(mocks.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        published_premium_url: 'https://trusted.test/show-1.pdf',
        published_premium_at: expect.any(String),
      })
    );
    expect(mocks.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        experience_is_published: true,
        experience_published_content: expect.objectContaining({
          outputs: { premiumPath: null, premiumUrl: 'https://trusted.test/show-1.pdf' },
        }),
      })
    );
    expect(result).toMatchObject({ premiumUrl: 'https://trusted.test/show-1.pdf' });
  });
});
