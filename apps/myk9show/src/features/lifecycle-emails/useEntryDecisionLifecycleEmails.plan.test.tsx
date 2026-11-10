/**
 * MYK9-1800: what follows an Accept or Waitlist. The show's switch for that email decides
 * whether anyone is emailed; whether the show is live decides whether she previews it first.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEntryDecisionLifecycleEmails } from './useEntryDecisionLifecycleEmails';
import { fetchShowLifecycleEmailSummary } from './api';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchEntryDecisionEmailStatuses: vi.fn().mockResolvedValue({}),
  fetchShowLifecycleEmailSummary: vi.fn(),
}));

type Summary = Awaited<ReturnType<typeof fetchShowLifecycleEmailSummary>>;

function mount(sendUnasked: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => useEntryDecisionLifecycleEmails({ showId: 'show-1', entries: [], sendUnasked }),
    { wrapper }
  );
  const summaryLoaded = () =>
    waitFor(() =>
      expect(client.getQueryState(['show-lifecycle-emails', 'show-1'])?.status).toBe('success')
    );
  return { ...view, summaryLoaded };
}

function summaryLoads(steps: Array<{ stepType: string; isEnabled: boolean }>) {
  vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue({ steps } as unknown as Summary);
}

describe('decisionEmailPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previews while the switch is not known yet, even on a live show', () => {
    vi.mocked(fetchShowLifecycleEmailSummary).mockReturnValue(new Promise(() => {}));
    const { result } = mount(true);

    expect(result.current.decisionEmailPlan('accepted')).toBe('preview');
  });

  it('sends with no preview when the switch is on and the show is live', async () => {
    summaryLoads([{ stepType: 'accepted', isEnabled: true }]);
    const { result } = mount(true);

    await waitFor(() => expect(result.current.decisionEmailPlan('accepted')).toBe('send'));
  });

  it('keeps the preview when the switch is on but the show is a draft or over', async () => {
    summaryLoads([{ stepType: 'accepted', isEnabled: true }]);
    const { result, rerender, summaryLoaded } = mount(false);

    await summaryLoaded();
    rerender();
    expect(result.current.decisionEmailPlan('accepted')).toBe('preview');
  });

  it('emails nobody when the show has that email switched off', async () => {
    summaryLoads([
      { stepType: 'accepted', isEnabled: false },
      { stepType: 'waitlisted', isEnabled: true },
    ]);
    const { result } = mount(true);

    await waitFor(() => expect(result.current.decisionEmailPlan('accepted')).toBe('none'));
    // Each email has its own switch.
    expect(result.current.decisionEmailPlan('waitlisted')).toBe('send');
  });
});
