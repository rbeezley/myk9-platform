import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerateAndPublishPremium } from '../useGenerateAndPublishPremium';
import { generatedPremium } from './fixtures/generatedPremium';

const harness = vi.hoisted(() => ({
  generate: vi.fn(),
  fetchDraft: vi.fn(),
  runPublish: vi.fn(),
}));

vi.mock('../useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: harness.generate,
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}));
vi.mock('../premiumContentDraft', async importOriginal => ({
  ...(await importOriginal<typeof import('../premiumContentDraft')>()),
  fetchPremiumContentDraft: harness.fetchDraft,
}));
vi.mock('../premiumPublishCoordinator', async importOriginal => ({
  ...(await importOriginal<typeof import('../premiumPublishCoordinator')>()),
  runPremiumPublishOperation: harness.runPublish,
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function republish() {
  const { result } = renderHook(() => useGenerateAndPublishPremium('show-a'), { wrapper });
  await act(async () => {
    await result.current.run();
  });
  const { createPremium } = harness.runPublish.mock.calls[0]?.[0] as {
    createPremium: () => Promise<unknown>;
  };
  return createPremium();
}

beforeEach(() => {
  harness.generate.mockReset();
  harness.fetchDraft.mockReset();
  harness.runPublish.mockReset().mockResolvedValue(undefined);
});

describe('Republish premium publishes the saved draft (MYK9-2201)', () => {
  it('lays only the draft fields over the generated premium', async () => {
    const generated = generatedPremium();
    harness.generate.mockResolvedValue(generated);
    harness.fetchDraft.mockResolvedValue({
      content: {
        narratives: { showHours: 'Edited hours' },
        supplemental: { hospitalityNotes: 'Coffee at the gate' },
      },
      savedAt: '2026-11-19T10:00:00.000Z',
    });

    expect(await republish()).toEqual({
      ...generated,
      narratives: { ...generated.narratives, showHours: 'Edited hours' },
      supplemental: { ...generated.supplemental, hospitalityNotes: 'Coffee at the gate' },
    });
  });

  it('publishes the generated premium unchanged when no draft is saved', async () => {
    const generated = generatedPremium();
    harness.generate.mockResolvedValue(generated);
    harness.fetchDraft.mockResolvedValue(null);

    expect(await republish()).toEqual(generated);
  });
});
