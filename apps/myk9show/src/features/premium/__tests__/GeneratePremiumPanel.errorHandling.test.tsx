import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, useEffect, type ReactNode } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GeneratedPremium } from '../../../types/premium-types';

// A controllable PDFDownloadLink mock. Each test sets `pdfErrorSequence`
// before rendering; the mock then steps through the sequence on a timer so
// the render-prop is genuinely re-invoked (matching real PDFDownloadLink
// behavior, which re-fires its render prop on every internal state tick).
const errorController: {
  sequence: Array<Error | null>;
  step: ((i: number) => void) | null;
} = { sequence: [], step: null };

vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn(() => ({ toBlob: vi.fn().mockResolvedValue(new Blob()) })),
  PDFDownloadLink: ({
    children,
  }: {
    children: (s: { loading: boolean; error: Error | null }) => ReactNode;
  }) => {
    const [idx, setIdx] = useState(0);
    errorController.step = setIdx;
    const error = errorController.sequence[idx] ?? null;
    return <>{children({ loading: false, error })}</>;
  },
  Document: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Page: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn() },
}));

const errorMock = vi.fn();
const successMock = vi.fn();
vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: (...args: unknown[]) => successMock(...args),
    error: (...args: unknown[]) => errorMock(...args),
  },
}));

const fakePremium: GeneratedPremium = {
  org: 'AKC',
  style: 'monogram',
  templateId: null,
  show: {
    name: 'Test Show',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    venue: '',
    entryOpenDate: '2026-04-01',
    entryCloseDate: '2026-05-15',
    preEntryFee: 20,
    dayOfFee: 25,
    acceptChecks: true,
    acceptCash: false,
  },
  club: { name: 'Club', logoUrl: null },
  secretary: { name: 'S', email: 's@x.com', phone: null },
  officials: [],
  trials: [],
  supplemental: {
    vetClinic: { name: 'V', address: 'A', phone: 'P' },
    accommodations: [],
    hospitalityNotes: null,
    awardsDescription: null,
    additionalNotes: null,
  },
  narratives: { showHours: 'h', trialInformation: 't' },
};

vi.mock('../useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: vi.fn().mockResolvedValue(fakePremium),
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock('../../../hooks/queries/usePremiumGenerations', () => ({
  useLogPremiumGeneration: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }),
    },
    from: () => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
  },
}));

import { GeneratePremiumPanel } from '../GeneratePremiumPanel';

function Harness() {
  // Force several re-renders of the panel after mount so the mocked
  // PDFDownloadLink's render-prop is invoked many times — emulating
  // PDFDownloadLink's real internal state-tick behavior.
  const [, setTick] = useState(0);
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setTick(n);
      if (n >= 5) clearInterval(id);
    }, 5);
    return () => clearInterval(id);
  }, []);
  return (
    <GeneratePremiumPanel
      open
      onClose={() => undefined}
      showId="show-1"
      clubId="club-1"
      showOrg="AKC"
    />
  );
}

function renderHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  );
}

async function openPanel() {
  // Generation auto-triggers when the panel opens; just await the picker.
  await waitFor(() => {
    expect(screen.getByRole('radiogroup', { name: /Premium style/i })).toBeInTheDocument();
  });
}

describe('GeneratePremiumPanel — PDF error toast deduplication', () => {
  beforeEach(() => {
    errorMock.mockClear();
    successMock.mockClear();
    errorController.sequence = [];
    errorController.step = null;
    vi.stubEnv('VITE_PREMIUM_NEW_STYLES_ENABLED', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fires the error toast exactly once for a sticky error across many render-prop invocations', async () => {
    const stickyError = new Error('boom-render');
    errorController.sequence = [stickyError, stickyError, stickyError, stickyError];
    renderHarness();
    await openPanel();

    // Let the harness tick through several re-renders.
    await waitFor(
      () => {
        expect(errorMock).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );
    // Wait long enough that all harness ticks fire.
    await new Promise(r => setTimeout(r, 60));

    expect(errorMock).toHaveBeenCalledTimes(1);
  });

  it('fires once for the same Error reference passed twice', async () => {
    const sameError = new Error('same-ref');
    errorController.sequence = [sameError, sameError];
    renderHarness();
    await openPanel();

    await waitFor(() => expect(errorMock).toHaveBeenCalled(), { timeout: 1000 });
    await new Promise(r => setTimeout(r, 60));

    expect(errorMock).toHaveBeenCalledTimes(1);
  });

  it('fires twice for two distinct error messages (null → err1 → err2)', async () => {
    const err1 = new Error('first-failure');
    const err2 = new Error('second-failure');
    errorController.sequence = [null, err1, err2];
    renderHarness();
    await openPanel();

    // Manually walk the sequence so we observe each transition.
    await waitFor(() => expect(errorController.step).toBeTruthy(), { timeout: 1000 });
    act(() => {
      errorController.step!(1);
    });
    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1), { timeout: 1000 });
    act(() => {
      errorController.step!(2);
    });
    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(2), { timeout: 1000 });

    expect(errorMock).toHaveBeenCalledTimes(2);
  });
});
