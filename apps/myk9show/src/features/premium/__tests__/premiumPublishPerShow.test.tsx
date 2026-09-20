import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useGenerateAndPublishPremium,
  usePremiumPublishStore,
} from '../useGenerateAndPublishPremium';
import { PremiumPublishError } from '../premiumPublishErrors';

const SHOW_A = 'show-a';
const SHOW_B = 'show-b';

const edges = vi.hoisted(() => ({
  generate: vi.fn(),
  publishExperience: vi.fn(async (_options: Record<string, unknown>) => undefined),
  release: {} as Record<string, (value?: unknown) => void>,
}));

vi.mock('../useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: edges.generate,
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock('@/features/experience/publishExperience', () => ({
  publishExperience: edges.publishExperience,
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A publish that hangs until the test lets it finish. */
function pending(showId: string) {
  return new Promise(resolve => {
    edges.release[showId] = resolve as (value?: unknown) => void;
  });
}

beforeEach(() => {
  usePremiumPublishStore.setState({ byShowId: {}, generatedByShowId: {} });
  edges.generate.mockReset();
  edges.publishExperience.mockClear();
  edges.release = {};
});

describe('premium publish state is per SHOW, not global', () => {
  it('lets a second show publish while the first is still in flight', async () => {
    edges.generate.mockImplementation(async (showId: string) => {
      await pending(showId);
      return { showId };
    });

    const a = renderHook(() => useGenerateAndPublishPremium(SHOW_A), { wrapper });
    const b = renderHook(() => useGenerateAndPublishPremium(SHOW_B), { wrapper });

    act(() => void a.result.current.run());
    await waitFor(() => expect(a.result.current.isBusy).toBe(true));
    // The global latch made this a silent no-op while A was publishing.
    act(() => void b.result.current.run());
    await waitFor(() => expect(b.result.current.isBusy).toBe(true));

    expect(edges.generate).toHaveBeenCalledTimes(2);
    expect(edges.generate.mock.calls.map(call => call[0]).sort()).toEqual([SHOW_A, SHOW_B]);
  });

  it('refuses a SECOND trigger for the same show, with busy visible on both', async () => {
    edges.generate.mockImplementation(async (showId: string) => {
      await pending(showId);
      return { showId };
    });

    // Two triggers on the same show — the card's button and the header item.
    const card = renderHook(() => useGenerateAndPublishPremium(SHOW_A), { wrapper });
    const header = renderHook(() => useGenerateAndPublishPremium(SHOW_A), { wrapper });

    act(() => void card.result.current.run());
    await waitFor(() => expect(card.result.current.isBusy).toBe(true));
    expect(header.result.current.isBusy).toBe(true);

    act(() => void header.result.current.run());
    expect(edges.generate).toHaveBeenCalledTimes(1);
  });

  it('keeps one show’s failure when another show starts publishing', async () => {
    edges.generate.mockImplementation(async (showId: string) => {
      if (showId === SHOW_A) throw new Error('boom');
      await pending(showId);
      return { showId };
    });

    const a = renderHook(() => useGenerateAndPublishPremium(SHOW_A), { wrapper });
    const b = renderHook(() => useGenerateAndPublishPremium(SHOW_B), { wrapper });

    await act(async () => {
      await a.result.current.run();
    });
    expect(a.result.current.publishFailed).toBe(true);

    act(() => void b.result.current.run());
    await waitFor(() => expect(b.result.current.isBusy).toBe(true));

    // `begin` used to clear the failure flag for EVERY show, wiping A's
    // "Try again" notice the moment B started.
    expect(a.result.current.publishFailed).toBe(true);
    expect(b.result.current.publishFailed).toBe(false);
  });

  it('retries a failed snapshot without paying for generation again', async () => {
    const premium = { showId: SHOW_A };
    edges.generate.mockResolvedValue(premium);
    edges.publishExperience
      .mockRejectedValueOnce(new PremiumPublishError('snapshot failed', 'experience-snapshot'))
      .mockResolvedValueOnce(undefined);

    const hook = renderHook(() => useGenerateAndPublishPremium(SHOW_A), { wrapper });

    await act(async () => {
      await hook.result.current.run();
    });
    expect(hook.result.current.publishFailed).toBe(true);

    await act(async () => {
      await hook.result.current.run();
    });

    expect(edges.generate).toHaveBeenCalledTimes(1);
    expect(edges.publishExperience).toHaveBeenCalledTimes(2);
    const firstAttempt = edges.publishExperience.mock.calls[0]?.[0];
    const secondAttempt = edges.publishExperience.mock.calls[1]?.[0];
    if (!firstAttempt || !secondAttempt) throw new Error('publish attempt arguments missing');
    expect(firstAttempt).toMatchObject({
      artifactId: expect.any(String),
      publishedAt: expect.any(String),
    });
    expect(secondAttempt).toMatchObject({
      artifactId: firstAttempt.artifactId,
      publishedAt: firstAttempt.publishedAt,
    });
    expect(hook.result.current.publishFailed).toBe(false);
  });
});
