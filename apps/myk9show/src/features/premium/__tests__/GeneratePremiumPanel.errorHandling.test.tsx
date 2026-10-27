import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type ReactNode } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GeneratedPremium } from '../../../types/premium-types';

// A controllable PDFDownloadLink mock. The mock reads `errorController.current`
// on every render, so a test changes the error and then re-renders the tree
// itself; there is no captured setter and no timer, so nothing depends on
// which mounted instance rendered last or on wall-clock ticks.
const errorController: { current: Error | null } = { current: null };

vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn(() => ({ toBlob: vi.fn().mockResolvedValue(new Blob()) })),
  PDFDownloadLink: ({
    children,
  }: {
    children: (s: { loading: boolean; error: Error | null }) => ReactNode;
  }) => {
    return <>{children({ loading: false, error: errorController.current })}</>;
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
  secretary: { name: 'S', email: 's@x.com', phone: null, mailingAddress: null },
  officials: { chairman: null },
  trials: [],
  supplemental: {
    vetClinic: { name: 'V', address: 'A', phone: 'P' },
    accommodations: [],
    coverImageUrl: null,
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

function PanelUnderTest() {
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

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // A fresh element each time: React bails out on an identical element.
  const tree = () => (
    <QueryClientProvider client={client}>
      <PanelUnderTest />
    </QueryClientProvider>
  );
  const view = render(tree());
  // Re-renders the whole tree so the mocked render-prop is invoked again,
  // like PDFDownloadLink's internal state ticks.
  const rerenderTree = () => act(() => view.rerender(tree()));
  return { rerenderTree };
}

async function openPanel() {
  // Generation auto-triggers when the panel opens; await the supplemental fields
  // section which appears once generation completes (style picker was removed in
  // migration 195 — style is now set on the show, not per-generation).
  await waitFor(() => {
    expect(screen.getByText(/Supplemental Fields/i)).toBeInTheDocument();
  });
}

describe('GeneratePremiumPanel — PDF error toast deduplication', () => {
  beforeEach(() => {
    errorMock.mockClear();
    successMock.mockClear();
    errorController.current = null;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fires the error toast exactly once for a sticky error across many render-prop invocations', async () => {
    errorController.current = new Error('boom-render');
    const { rerenderTree } = renderPanel();
    await openPanel();
    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1));

    // Each tick hands the watcher a NEW Error instance with the same message,
    // so only the message-level dedupe can keep the toast to one.
    for (let i = 0; i < 5; i += 1) {
      errorController.current = new Error('boom-render');
      await rerenderTree();
    }

    expect(errorMock).toHaveBeenCalledTimes(1);
  });

  it('fires once for the same Error reference passed twice', async () => {
    const sameError = new Error('same-ref');
    errorController.current = sameError;
    const { rerenderTree } = renderPanel();
    await openPanel();
    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1));

    errorController.current = sameError;
    await rerenderTree();
    await rerenderTree();

    expect(errorMock).toHaveBeenCalledTimes(1);
  });

  it('fires twice for two distinct error messages (null → err1 → err2)', async () => {
    const { rerenderTree } = renderPanel();
    await openPanel();
    await screen.findByText('Download PDF');
    expect(errorMock).not.toHaveBeenCalled();

    errorController.current = new Error('first-failure');
    await rerenderTree();
    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1));

    errorController.current = new Error('second-failure');
    await rerenderTree();
    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(2));
  });
});
