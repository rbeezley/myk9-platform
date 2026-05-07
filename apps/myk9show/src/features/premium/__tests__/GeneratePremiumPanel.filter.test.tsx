import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GeneratedPremium } from '../../../types/premium-types';

vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn(() => ({ toBlob: vi.fn().mockResolvedValue(new Blob()) })),
  PDFDownloadLink: ({
    children,
  }: {
    children: (s: { loading: boolean; error: Error | null }) => React.ReactNode;
  }) => children({ loading: false, error: null }),
  Document: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn() },
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
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

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GeneratePremiumPanel
        open
        onClose={() => undefined}
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
      />
    </QueryClientProvider>
  );
}

async function openPicker() {
  // Generation now auto-triggers when the panel opens; just await the picker.
  await waitFor(() => {
    expect(screen.getByRole('radiogroup', { name: /Premium style/i })).toBeInTheDocument();
  });
}

describe('GeneratePremiumPanel — style picker filter', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows only the 3 legacy styles when feature flag is off', async () => {
    vi.stubEnv('VITE_PREMIUM_NEW_STYLES_ENABLED', 'false');
    renderPanel();
    await openPicker();
    expect(screen.getByRole('radio', { name: /Monogram/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Banner/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Headline/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Magazine/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Poster/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Gazette/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Field Guide/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Heritage/i })).not.toBeInTheDocument();
  });

  it('shows all 8 styles when feature flag is on', async () => {
    vi.stubEnv('VITE_PREMIUM_NEW_STYLES_ENABLED', 'true');
    renderPanel();
    await openPicker();
    for (const name of [
      /Monogram/i,
      /Banner/i,
      /Headline/i,
      /Magazine/i,
      /Poster/i,
      /Gazette/i,
      /Field Guide/i,
      /Heritage/i,
    ]) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
  });
});
