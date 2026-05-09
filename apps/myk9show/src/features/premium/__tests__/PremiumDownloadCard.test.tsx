import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PremiumDownloadCard } from '../PremiumDownloadCard';

const maybeSingleMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock,
        })),
      })),
    })),
  },
}));

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PremiumDownloadCard showId="show-1" />
    </QueryClientProvider>
  );
}

describe('PremiumDownloadCard', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
  });

  it('opens published premium lists in a new tab', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: 'https://example.test/premium.pdf',
        published_premium_at: '2026-05-09T12:00:00.000Z',
        updated_at: '2026-05-09T12:00:00.000Z',
      },
      error: null,
    });

    renderCard();

    const link = await screen.findByRole('link', { name: /download pdf/i });
    expect(link).toHaveAttribute('href', 'https://example.test/premium.pdf');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).not.toHaveAttribute('download');
  });
});
