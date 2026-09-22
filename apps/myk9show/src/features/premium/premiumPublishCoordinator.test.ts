import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedPremium } from '@/types/premium-types';
import { premiumPublishIntentFingerprint } from './premiumPublishIntent';

interface PublishAttemptArgs {
  showId: string;
  attempt: unknown;
}

const beginMock = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]): Promise<{ data: unknown; error: unknown | null }> => ({
    data: 7,
    error: null,
  }))
);
const publishExperienceMock = vi.hoisted(() =>
  vi.fn(async (_args: PublishAttemptArgs) => {
    await new Promise(resolve => setTimeout(resolve, 0));
    return { publishedAt: '2026-09-19T12:00:00.000Z', premiumUrl: 'https://trusted.test/a.pdf' };
  })
);
const publishLegacyMock = vi.hoisted(() =>
  vi.fn(async () => ({
    publishedAt: '2026-09-19T12:00:00.000Z',
    premiumUrl: 'https://trusted.test/legacy.pdf',
  }))
);

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc: beginMock } }));
vi.mock('@/features/experience/publishExperience', () => ({
  publishExperience: publishExperienceMock,
}));
vi.mock('@/features/experience/publishExperienceLegacy', () => ({
  publishExperienceLegacy: publishLegacyMock,
}));

import {
  publishGeneratedPremiumAttempt,
  resetPremiumPublishCoordinatorForTests,
} from './premiumPublishCoordinator';
import { PremiumPublishError } from './premiumPublishErrors';

function premium(venue = 'Louisville'): GeneratedPremium {
  return {
    org: 'AKC',
    style: 'heritage',
    templateId: null,
    show: {
      name: 'Bluegrass Classic',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      venue,
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
  };
}

function input(options?: { venue?: string; inkSaver?: boolean }) {
  return {
    showId: 'show-1',
    premium: premium(options?.venue),
    inkSaver: options?.inkSaver ?? false,
  };
}

describe('premium publish coordinator', () => {
  beforeEach(() => {
    beginMock.mockReset();
    beginMock.mockResolvedValue({ data: 7, error: null });
    publishExperienceMock.mockReset();
    publishExperienceMock.mockImplementation(async () => ({
      publishedAt: '2026-09-19T12:00:00.000Z',
      premiumUrl: 'https://trusted.test/a.pdf',
    }));
    publishLegacyMock.mockReset();
    publishLegacyMock.mockResolvedValue({
      publishedAt: '2026-09-19T12:00:00.000Z',
      premiumUrl: 'https://trusted.test/legacy.pdf',
    });
    resetPremiumPublishCoordinatorForTests();
  });

  it('shares an identical in-flight intent for duplicate submits', async () => {
    const first = publishGeneratedPremiumAttempt(input());
    const second = publishGeneratedPremiumAttempt(input());
    await Promise.all([first, second]);
    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(publishExperienceMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the same version and artifact after a lost response for the same complete intent', async () => {
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost'));
    await expect(publishGeneratedPremiumAttempt(input({ inkSaver: true }))).rejects.toThrow(
      'response lost'
    );
    await publishGeneratedPremiumAttempt(input({ inkSaver: true }));

    expect(beginMock).toHaveBeenCalledTimes(1);
    const firstAttempt = publishExperienceMock.mock.calls[0]?.[0].attempt as {
      artifactId: string;
      publishVersion: number;
      fingerprint: string;
    };
    const retryAttempt = publishExperienceMock.mock.calls[1]?.[0].attempt as typeof firstAttempt;
    expect(retryAttempt).toMatchObject({
      artifactId: firstAttempt.artifactId,
      publishVersion: 7,
      fingerprint: premiumPublishIntentFingerprint({ premium: premium(), inkSaver: true }),
    });
  });

  it('starts a new artifact and version when only inkSaver changes', async () => {
    beginMock
      .mockResolvedValueOnce({ data: 7, error: null })
      .mockResolvedValueOnce({ data: 8, error: null });
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost'));
    await expect(publishGeneratedPremiumAttempt(input({ inkSaver: false }))).rejects.toThrow();
    await publishGeneratedPremiumAttempt(input({ inkSaver: true }));

    const firstAttempt = publishExperienceMock.mock.calls[0]?.[0].attempt as {
      artifactId: string;
      publishVersion: number;
    };
    const secondAttempt = publishExperienceMock.mock.calls[1]?.[0].attempt as typeof firstAttempt;
    expect(secondAttempt.publishVersion).toBe(8);
    expect(secondAttempt.artifactId).not.toBe(firstAttempt.artifactId);
  });

  it('does not let a different in-flight intent join the first promise', async () => {
    const first = publishGeneratedPremiumAttempt(input());
    await expect(
      publishGeneratedPremiumAttempt(input({ venue: 'Lexington' }))
    ).rejects.toMatchObject({
      code: 'intent-conflict',
    });
    await first;
    expect(publishExperienceMock).toHaveBeenCalledTimes(1);
  });

  it('evicts stale attempts so the next explicit retry starts a fresh version', async () => {
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
    await expect(publishGeneratedPremiumAttempt(input())).rejects.toMatchObject({
      code: 'stale-attempt',
    });
    await publishGeneratedPremiumAttempt(input());
    const retried = publishExperienceMock.mock.calls[1]?.[0].attempt as {
      artifactId: string;
      publishVersion: number;
    };
    expect(retried.publishVersion).toBe(8);
    expect(retried.artifactId).not.toBe(
      (publishExperienceMock.mock.calls[0]?.[0].attempt as { artifactId: string }).artifactId
    );
  });

  it('hydrates a valid same-intent attempt from session storage after reload', async () => {
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost'));
    const savedInput = input({ inkSaver: true });
    await expect(publishGeneratedPremiumAttempt(savedInput)).rejects.toThrow('response lost');
    const firstAttempt = publishExperienceMock.mock.calls[0]?.[0].attempt;
    if (!firstAttempt) throw new Error('first attempt missing');
    resetPremiumPublishCoordinatorForTests({ preserveStorage: true });
    await publishGeneratedPremiumAttempt(savedInput);
    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(publishExperienceMock.mock.calls[1]?.[0].attempt).toEqual(firstAttempt);
  });

  it('discards corrupt or unsupported persisted attempt data', async () => {
    sessionStorage.setItem('myk9:premium-publish-attempts:v2', '{bad json');
    await publishGeneratedPremiumAttempt(input());
    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('myk9:premium-publish-attempts:v2')).toBeNull();
  });

  it('uses the legacy adapter only when the begin RPC is absent from the old schema', async () => {
    beginMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.begin_premium_publish in the schema cache',
      },
    });

    await expect(publishGeneratedPremiumAttempt(input())).resolves.toMatchObject({
      premiumUrl: 'https://trusted.test/legacy.pdf',
    });
    expect(publishLegacyMock).toHaveBeenCalledWith({
      showId: 'show-1',
      intent: { premium: premium(), inkSaver: false },
    });
    expect(publishExperienceMock).not.toHaveBeenCalled();
  });

  it('does not use legacy publishing for authorization or other begin-RPC errors', async () => {
    beginMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Not authorized to publish this show' },
    });

    await expect(publishGeneratedPremiumAttempt(input())).rejects.toMatchObject({
      code: 'permission',
    });
    expect(publishLegacyMock).not.toHaveBeenCalled();
  });

  it('uses the legacy adapter when only the versioned commit RPC is missing', async () => {
    publishExperienceMock.mockRejectedValueOnce(
      new PremiumPublishError('Missing publication RPC', 'experience-snapshot', 'unknown', {
        code: 'PGRST202',
        message: 'Could not find the function public.publish_premium_artifact in the schema cache',
      })
    );

    await expect(publishGeneratedPremiumAttempt(input())).resolves.toMatchObject({
      premiumUrl: 'https://trusted.test/legacy.pdf',
    });
    expect(publishLegacyMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('myk9:premium-publish-attempts:v2')).toBeNull();
  });
});
