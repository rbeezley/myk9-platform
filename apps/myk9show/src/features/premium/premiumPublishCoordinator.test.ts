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
import { PremiumPublishError } from './premiumPublishErrors';

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
    await publishGeneratedPremiumAttempt({ ...input, premium: { style: 'heritage' } as never });

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

  it('evicts a stale attempt so the next explicit retry starts a fresh version', async () => {
    beginMock
      .mockResolvedValueOnce({ data: 7, error: null })
      .mockResolvedValueOnce({ data: 8, error: null });
    publishExperienceMock
      .mockRejectedValueOnce(
        new PremiumPublishError('stale version', 'experience-snapshot', 'stale-attempt')
      )
      .mockResolvedValueOnce({
        publishedAt: '2026-09-19T12:00:01.000Z',
        premiumUrl: 'https://trusted.test/b.pdf',
      });
    const input = {
      showId: 'show-1',
      premium: { style: 'heritage' } as never,
      inkSaver: false,
    };

    await expect(publishGeneratedPremiumAttempt(input)).rejects.toMatchObject({
      code: 'stale-attempt',
    });
    await publishGeneratedPremiumAttempt(input);

    expect(beginMock).toHaveBeenCalledTimes(2);
    const firstAttempt = publishExperienceMock.mock.calls[0]?.[0];
    const secondAttempt = publishExperienceMock.mock.calls[1]?.[0];
    if (!firstAttempt || !secondAttempt) throw new Error('publish attempt arguments missing');
    expect(secondAttempt.publishVersion).toBe(8);
    expect(secondAttempt.artifactId).not.toBe(firstAttempt.artifactId);
  });

  it('starts a fresh version when the generated premium changes after a failed attempt', async () => {
    beginMock
      .mockResolvedValueOnce({ data: 7, error: null })
      .mockResolvedValueOnce({ data: 8, error: null });
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({
      publishedAt: '2026-09-19T12:00:01.000Z',
      premiumUrl: 'https://trusted.test/b.pdf',
    });
    const firstInput = {
      showId: 'show-1',
      premium: { style: 'heritage', title: 'First' } as never,
      inkSaver: false,
    };

    await expect(publishGeneratedPremiumAttempt(firstInput)).rejects.toThrow('response lost');
    await publishGeneratedPremiumAttempt({
      ...firstInput,
      premium: { style: 'heritage', title: 'Changed' } as never,
    });

    expect(beginMock).toHaveBeenCalledTimes(2);
    const secondAttempt = publishExperienceMock.mock.calls[1]?.[0];
    if (!secondAttempt) throw new Error('second publish attempt arguments missing');
    expect(secondAttempt.publishVersion).toBe(8);
    expect(secondAttempt.premium).toEqual({ style: 'heritage', title: 'Changed' });
  });

  it('hydrates a pending attempt from session storage after a reload', async () => {
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost'));
    const input = {
      showId: 'show-1',
      premium: { style: 'heritage' } as never,
      inkSaver: false,
    };

    await expect(publishGeneratedPremiumAttempt(input)).rejects.toThrow('response lost');
    const firstAttempt = publishExperienceMock.mock.calls[0]?.[0];
    if (!firstAttempt) throw new Error('first publish attempt arguments missing');

    resetPremiumPublishCoordinatorForTests({ preserveStorage: true });
    await publishGeneratedPremiumAttempt(input);

    expect(beginMock).toHaveBeenCalledTimes(1);
    const recoveredAttempt = publishExperienceMock.mock.calls[1]?.[0];
    if (!recoveredAttempt) throw new Error('recovered publish attempt arguments missing');
    expect(recoveredAttempt).toMatchObject({
      artifactId: firstAttempt.artifactId,
      publishedAt: firstAttempt.publishedAt,
      publishVersion: firstAttempt.publishVersion,
    });
  });

  it('discards corrupt session storage and begins a fresh attempt', async () => {
    sessionStorage.setItem('myk9:premium-publish-attempts:v1', '{bad json');
    await publishGeneratedPremiumAttempt({
      showId: 'show-1',
      premium: { style: 'heritage' } as never,
      inkSaver: false,
    });

    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('myk9:premium-publish-attempts:v1')).toBeNull();
  });
});
