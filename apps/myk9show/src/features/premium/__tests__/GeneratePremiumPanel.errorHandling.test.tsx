import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GeneratedPremium } from '../../../types/premium-types';

// renderPremiumPdf is the one PDF build the editor uses. Each test settles it by hand.
const renderMock = vi.fn();
vi.mock('../publishPremium', () => ({
  renderPremiumPdf: (...args: unknown[]) => renderMock(...args),
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
  render(
    <QueryClientProvider client={client}>
      <PanelUnderTest />
    </QueryClientProvider>
  );
}

async function openPanel() {
  // Generation auto-triggers when the panel opens; await the supplemental fields
  // section which appears once generation completes (style picker was removed in
  // migration 195 — style is now set on the show, not per-generation).
  await waitFor(() => {
    expect(screen.getByText(/Supplemental Fields/i)).toBeInTheDocument();
  });
}

async function tryAgain() {
  await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
}

describe('GeneratePremiumPanel: PDF error toast deduplication', () => {
  // The editor loads PremiumPdfDownloadLink with React.lazy. Load it up front so the lazy
  // import resolves from the module cache and the buttons depend on nothing slower than a
  // microtask.
  beforeAll(async () => {
    await import('../PremiumPdfDownloadLink');
  }, 60_000);

  beforeEach(() => {
    errorMock.mockClear();
    successMock.mockClear();
    renderMock.mockReset();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('shows a final error with Try again and toasts once', async () => {
    renderMock.mockRejectedValue(new Error('boom-render'));
    renderPanel();
    await openPanel();
    await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Preparing PDF...')).not.toBeInTheDocument();
    expect(errorMock).toHaveBeenCalledTimes(1);
  });

  it('toasts once when Try again fails with the same message', async () => {
    renderMock.mockRejectedValue(new Error('same-message'));
    renderPanel();
    await openPanel();
    await tryAgain();
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: 'Try again' });
    await tryAgain();
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(3));
    await screen.findByRole('button', { name: 'Try again' });

    expect(errorMock).toHaveBeenCalledTimes(1);
  });

  it('toasts twice for two distinct error messages', async () => {
    renderMock.mockRejectedValueOnce(new Error('first-failure'));
    renderMock.mockRejectedValueOnce(new Error('second-failure'));
    renderPanel();
    await openPanel();
    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1));
    await tryAgain();
    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(2));
  });

  it('Try again rebuilds only the PDF and then offers the download link', async () => {
    renderMock.mockRejectedValueOnce(new Error('transient'));
    renderMock.mockResolvedValueOnce(new Blob(['x'], { type: 'application/pdf' }));
    renderPanel();
    await openPanel();
    await tryAgain();
    const link = await screen.findByRole('link', { name: 'Download PDF' });
    expect(link).toHaveAttribute('href', 'blob:x');
    expect(link).toHaveAttribute('download', expect.stringMatching(/premium\.pdf$/));
    expect(renderMock).toHaveBeenCalledTimes(2);
  });
});
