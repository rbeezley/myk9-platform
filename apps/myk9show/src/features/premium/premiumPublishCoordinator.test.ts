import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedPremium } from '@/types/premium-types';
import { premiumPublishDraftKey } from './premiumPublishIntent';
import {
  runPremiumPublishOperation,
  resetPremiumPublishCoordinatorForTests,
} from './premiumPublishCoordinator';

interface PublishAttemptArgs {
  showId: string;
  attempt: unknown;
}

const beginMock = vi.hoisted(() =>
  vi.fn(
    async (
      ..._args: unknown[]
    ): Promise<{
      data: unknown;
      error: unknown | null;
    }> => ({
      data: { status: 'reserved', version: 7 },
      error: null,
    })
  )
);
const getUserMock = vi.hoisted(() =>
  vi.fn(async () => ({
    data: { user: { id: 'user-a' } },
    error: null,
  }))
);
const publishExperienceMock = vi.hoisted(() =>
  vi.fn(async (_args: PublishAttemptArgs) => {
    await new Promise(resolve => setTimeout(resolve, 0));
    return { publishedAt: '2026-09-19T12:00:00.000Z', premiumUrl: 'https://trusted.test/a.pdf' };
  })
);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: beginMock, auth: { getUser: getUserMock } },
}));
vi.mock('@/features/experience/publishExperience', () => ({
  publishExperience: publishExperienceMock,
}));

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

function operation(options?: {
  showId?: string;
  venue?: string;
  inkSaver?: boolean;
  intentKey?: string;
  mode?: 'generated' | 'draft';
}) {
  const value = premium(options?.venue);
  const mode = options?.mode ?? 'generated';
  const inkSaver = options?.inkSaver ?? false;
  return {
    showId: options?.showId ?? 'show-1',
    mode,
    intentKey:
      options?.intentKey ??
      (mode === 'generated'
        ? 'generated-current-sources'
        : premiumPublishDraftKey({ premium: value, inkSaver })),
    inkSaver,
    createPremium: vi.fn(async () => value),
  } as const;
}

describe('premium publish coordinator', () => {
  beforeEach(() => {
    beginMock.mockReset();
    beginMock.mockResolvedValue({ data: { status: 'reserved', version: 7 }, error: null });
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
    publishExperienceMock.mockReset();
    publishExperienceMock.mockImplementation(async () => ({
      publishedAt: '2026-09-19T12:00:00.000Z',
      premiumUrl: 'https://trusted.test/a.pdf',
    }));
    resetPremiumPublishCoordinatorForTests();
  });

  it('installs the lock synchronously and shares identical operations', async () => {
    let release!: () => void;
    publishExperienceMock.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => {
        release = resolve;
      });
      return { publishedAt: '2026-09-19T12:00:00.000Z', premiumUrl: 'https://trusted.test/a.pdf' };
    });
    const input = operation();
    const first = runPremiumPublishOperation(input);
    const second = runPremiumPublishOperation(operation());
    await vi.waitFor(() => expect(beginMock).toHaveBeenCalledTimes(1));
    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(input.createPremium).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(publishExperienceMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a different in-flight intent with a typed conflict', async () => {
    let release!: () => void;
    publishExperienceMock.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => {
        release = resolve;
      });
      return { publishedAt: 'now', premiumUrl: 'url' };
    });
    const first = runPremiumPublishOperation(operation());
    await Promise.resolve();
    await expect(
      runPremiumPublishOperation(operation({ mode: 'draft', intentKey: 'draft:changed' }))
    ).rejects.toMatchObject({ code: 'intent-conflict' });
    release();
    await first;
  });

  it('allows independent shows to publish concurrently', async () => {
    const first = runPremiumPublishOperation(operation({ showId: 'show-a' }));
    const second = runPremiumPublishOperation(operation({ showId: 'show-b' }));
    await Promise.all([first, second]);
    expect(beginMock).toHaveBeenCalledTimes(2);
    expect(publishExperienceMock).toHaveBeenCalledTimes(2);
  });

  it('reconciles a lost commit response before regenerating or reserving another version', async () => {
    const firstOperation = operation();
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost'));
    await expect(runPremiumPublishOperation(firstOperation)).rejects.toThrow('response lost');
    beginMock.mockResolvedValueOnce({
      data: {
        status: 'already_committed',
        version: 7,
        publishedAt: '2026-09-19T12:00:00.000Z',
        premiumUrl: 'https://trusted.test/a.pdf',
      },
      error: null,
    });

    await expect(runPremiumPublishOperation(operation())).resolves.toEqual({
      publishedAt: '2026-09-19T12:00:00.000Z',
      premiumUrl: 'https://trusted.test/a.pdf',
    });
    expect(beginMock).toHaveBeenCalledTimes(2);
    expect(beginMock).toHaveBeenLastCalledWith('begin_or_reconcile_premium_publish', {
      p_show_id: 'show-1',
      p_prior_version: 7,
      p_prior_path: expect.stringMatching(/^show-1\/.+\.pdf$/),
    });
    expect(firstOperation.createPremium).toHaveBeenCalledTimes(1);
    expect(publishExperienceMock).toHaveBeenCalledTimes(1);
  });

  it('reconciles an exact authored draft without regenerating the saved content', async () => {
    const firstOperation = operation({ mode: 'draft' });
    publishExperienceMock.mockRejectedValueOnce(new Error('commit response lost'));
    await expect(runPremiumPublishOperation(firstOperation)).rejects.toThrow(
      'commit response lost'
    );
    beginMock.mockResolvedValueOnce({
      data: {
        status: 'already_committed',
        version: 7,
        publishedAt: '2026-09-19T12:00:00.000Z',
        premiumUrl: 'https://trusted.test/a.pdf',
      },
      error: null,
    });
    const retry = operation({ mode: 'draft' });
    await runPremiumPublishOperation(retry);
    expect(retry.createPremium).not.toHaveBeenCalled();
    expect(publishExperienceMock).toHaveBeenCalledTimes(1);
  });

  it('reserves a fresh version and reuses staged bytes only for identical regenerated content', async () => {
    publishExperienceMock.mockRejectedValueOnce(new Error('commit response lost'));
    await expect(runPremiumPublishOperation(operation())).rejects.toThrow('commit response lost');
    beginMock.mockResolvedValueOnce({ data: { status: 'reserved', version: 8 }, error: null });
    await runPremiumPublishOperation(operation());

    const first = publishExperienceMock.mock.calls[0]?.[0].attempt as { artifactId: string };
    const retry = publishExperienceMock.mock.calls[1]?.[0].attempt as {
      artifactId: string;
      publishVersion: number;
      mode: string;
      publisherId: string;
    };
    expect(retry).toMatchObject({
      artifactId: first.artifactId,
      publishVersion: 8,
      mode: 'generated',
      publisherId: 'user-a',
    });
  });

  it('uses a fresh artifact after regeneration changes the current source intent', async () => {
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost'));
    await expect(runPremiumPublishOperation(operation())).rejects.toThrow('response lost');
    beginMock.mockResolvedValueOnce({ data: { status: 'reserved', version: 8 }, error: null });
    await runPremiumPublishOperation(operation({ venue: 'Lexington' }));
    const first = publishExperienceMock.mock.calls[0]?.[0].attempt as { artifactId: string };
    const second = publishExperienceMock.mock.calls[1]?.[0].attempt as {
      artifactId: string;
      publishVersion: number;
    };
    expect(second.publishVersion).toBe(8);
    expect(second.artifactId).not.toBe(first.artifactId);
  });

  it('does not reuse attempts after the publisher changes', async () => {
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost'));
    await expect(runPremiumPublishOperation(operation())).rejects.toThrow('response lost');
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'user-b' } }, error: null });
    beginMock.mockResolvedValueOnce({ data: { status: 'reserved', version: 8 }, error: null });
    await runPremiumPublishOperation(operation());
    const first = publishExperienceMock.mock.calls[0]?.[0].attempt as { artifactId: string };
    const second = publishExperienceMock.mock.calls[1]?.[0].attempt as {
      artifactId: string;
      publisherId: string;
    };
    expect(second.publisherId).toBe('user-b');
    expect(second.artifactId).not.toBe(first.artifactId);
    expect(beginMock.mock.calls[1]?.[0]).toBe('begin_or_reconcile_premium_publish');
    expect(beginMock.mock.calls[1]?.[1]).toMatchObject({
      p_prior_version: null,
      p_prior_path: null,
    });
  });

  it('returns retryable setup guidance without falling back when reservation RPC is missing', async () => {
    beginMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message:
          'Could not find the function public.begin_or_reconcile_premium_publish in the schema cache',
      },
    });
    await expect(runPremiumPublishOperation(operation())).rejects.toMatchObject({
      code: 'setup-required',
    });
    expect(publishExperienceMock).not.toHaveBeenCalled();
    beginMock.mockResolvedValueOnce({ data: { status: 'reserved', version: 8 }, error: null });
    await runPremiumPublishOperation(operation());
    expect(beginMock).toHaveBeenCalledTimes(2);
  });

  it('reports stale commits and lets the next operation reserve a new version', async () => {
    publishExperienceMock
      .mockRejectedValueOnce(
        new PremiumPublishError('stale version', 'experience-snapshot', 'stale-attempt')
      )
      .mockResolvedValueOnce({ publishedAt: 'later', premiumUrl: 'url' });
    await expect(runPremiumPublishOperation(operation())).rejects.toMatchObject({
      code: 'stale-attempt',
    });
    beginMock.mockResolvedValueOnce({ data: { status: 'reserved', version: 8 }, error: null });
    await runPremiumPublishOperation(operation());
    expect(publishExperienceMock).toHaveBeenCalledTimes(2);
  });

  it('fails clearly if a persisted draft intent changes while its previous publication is pending', async () => {
    const draft = operation({ mode: 'draft', intentKey: 'draft:v1' });
    publishExperienceMock.mockRejectedValueOnce(new Error('response lost'));
    await expect(runPremiumPublishOperation(draft)).rejects.toThrow('response lost');
    beginMock.mockResolvedValueOnce({ data: { status: 'reserved', version: 8 }, error: null });
    const updated = operation({ mode: 'draft', intentKey: 'draft:v2', venue: 'Lexington' });
    await runPremiumPublishOperation(updated);
    const first = publishExperienceMock.mock.calls[0]?.[0].attempt as { artifactId: string };
    const second = publishExperienceMock.mock.calls[1]?.[0].attempt as { artifactId: string };
    expect(second.artifactId).not.toBe(first.artifactId);
  });
});
