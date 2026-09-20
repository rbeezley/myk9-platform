import { beforeEach, describe, expect, it, vi } from 'vitest';

interface PublishAttemptArgs {
  showId: string;
  premium: unknown;
  inkSaver: boolean;
  artifactId: string;
  publishedAt: string;
  publishVersion: number;
}

const beginMock = vi.hoisted(() => vi.fn(async () => ({ data: 7, error: null })));
const publishExperienceMock = vi.hoisted(() =>
  vi.fn(async (_args: PublishAttemptArgs) => {
    await new Promise(resolve => setTimeout(resolve, 0));
    return { publishedAt: '2026-09-19T12:00:00.000Z', premiumUrl: 'https://trusted.test/a.pdf' };
  })
);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: beginMock },
}));

vi.mock('@/features/experience/publishExperience', () => ({
  publishExperience: publishExperienceMock,
}));

import { publishGeneratedPremiumAttempt } from './premiumPublishCoordinator';
import { resetPremiumPublishCoordinatorForTests } from './premiumPublishCoordinator';

describe('premium publish coordinator', () => {
  beforeEach(() => {
    beginMock.mockReset();
    beginMock.mockResolvedValue({ data: 7, error: null });
    publishExperienceMock.mockReset();
    publishExperienceMock.mockResolvedValue({
      publishedAt: '2026-09-19T12:00:00.000Z',
      premiumUrl: 'https://trusted.test/a.pdf',
    });
    resetPremiumPublishCoordinatorForTests();
  });

  it('shares one in-flight attempt for duplicate submits of a show', async () => {
    const input = {
      showId: 'show-1',
      premium: { style: 'heritage' } as never,
      inkSaver: false,
    };

    const first = publishGeneratedPremiumAttempt(input);
    const second = publishGeneratedPremiumAttempt(input);

    await Promise.all([first, second]);

    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(publishExperienceMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the same version and artifact after a lost-response failure', async () => {
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({
      publishedAt: '2026-09-19T12:00:01.000Z',
      premiumUrl: 'https://trusted.test/a.pdf',
    });
    const input = {
      showId: 'show-1',
      premium: { style: 'heritage' } as never,
      inkSaver: false,
    };

    await expect(publishGeneratedPremiumAttempt(input)).rejects.toThrow('response lost');
    await publishGeneratedPremiumAttempt({ ...input, premium: { style: 'monogram' } as never });

    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(publishExperienceMock).toHaveBeenCalledTimes(2);
    const firstAttempt = publishExperienceMock.mock.calls[0]?.[0];
    const secondAttempt = publishExperienceMock.mock.calls[1]?.[0];
    if (!firstAttempt || !secondAttempt) throw new Error('publish attempt arguments missing');
    expect(secondAttempt).toMatchObject({
      artifactId: firstAttempt.artifactId,
      publishedAt: firstAttempt.publishedAt,
      publishVersion: 7,
      premium: { style: 'heritage' },
    });
  });
});
