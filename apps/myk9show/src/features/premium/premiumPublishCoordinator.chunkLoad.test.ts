import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedPremium } from '@/types/premium-types';
import * as coordinator from './premiumPublishCoordinator';

// The coordinator loads publishExperience through importPublishExperience (a
// dynamic import that carries @react-pdf/renderer). These tests fail that
// import and watch what the coordinator does around it.

const beginMock = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({
    data: { status: 'reserved', version: 7 } as unknown,
    error: null as unknown,
  }))
);
const publishExperienceMock = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => ({
    publishedAt: '2026-09-19T12:00:00.000Z',
    premiumUrl: 'https://trusted.test/a.pdf',
  }))
);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: beginMock,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-a' } }, error: null })) },
  },
}));
const importMock = vi.hoisted(() => vi.fn());
vi.mock('./importPublishExperience', () => ({ importPublishExperience: importMock }));

const chunkError = () =>
  new TypeError('Failed to fetch dynamically imported module: https://x.test/a.js');

const ATTEMPT_STORAGE_KEY = 'myk9:premium-publish-attempts:v4';

function premium(): GeneratedPremium {
  return {
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
  };
}

function operation() {
  return {
    showId: 'show-1',
    mode: 'generated' as const,
    intentKey: 'generated-current-sources',
    inkSaver: false,
    createPremium: vi.fn(async () => premium()),
  };
}

describe('premium publish coordinator chunk loading', () => {
  beforeEach(() => {
    beginMock.mockClear();
    publishExperienceMock.mockClear();
    importMock.mockReset();
    importMock.mockResolvedValue({ publishExperience: publishExperienceMock });
    coordinator.resetPremiumPublishCoordinatorForTests();
    sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
  });

  it('fails a chunk-load error before reserving or persisting anything', async () => {
    importMock.mockRejectedValueOnce(chunkError());
    const op = operation();

    await expect(coordinator.runPremiumPublishOperation(op)).rejects.toMatchObject({
      code: 'app-updated',
      message: 'The app was updated — reload the page and publish again',
    });

    expect(beginMock).not.toHaveBeenCalled();
    expect(op.createPremium).not.toHaveBeenCalled();
    expect(coordinator.getPremiumPublishAttempt('show-1')).toBeUndefined();
    expect(sessionStorage.getItem(ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(publishExperienceMock).not.toHaveBeenCalled();
  });

  it('does not cache a rejected import: the next publish retries and succeeds', async () => {
    importMock.mockRejectedValueOnce(chunkError());

    await expect(coordinator.runPremiumPublishOperation(operation())).rejects.toMatchObject({
      code: 'app-updated',
    });
    await expect(coordinator.runPremiumPublishOperation(operation())).resolves.toEqual({
      publishedAt: '2026-09-19T12:00:00.000Z',
      premiumUrl: 'https://trusted.test/a.pdf',
    });

    expect(importMock).toHaveBeenCalledTimes(2);
    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(publishExperienceMock).toHaveBeenCalledTimes(1);
  });

  it('shares one import across concurrent publishes', async () => {
    await Promise.all([
      coordinator.runPremiumPublishOperation({ ...operation(), showId: 'show-a' }),
      coordinator.runPremiumPublishOperation({ ...operation(), showId: 'show-b' }),
    ]);

    expect(importMock).toHaveBeenCalledTimes(1);
    expect(publishExperienceMock).toHaveBeenCalledTimes(2);
  });
});
