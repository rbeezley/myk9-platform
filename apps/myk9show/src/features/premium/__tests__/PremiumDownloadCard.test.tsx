import { screen } from '@/test/utils/testUtils';
import { createTestQueryClient, render } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PremiumDownloadCard } from '../PremiumDownloadCard';

const maybeSingleMock = vi.hoisted(() => vi.fn());
const generateMock = vi.hoisted(() => vi.fn());

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

vi.mock('../useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: generateMock,
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock('@/features/experience/publishExperience', () => ({
  publishExperience: vi.fn(),
}));

function renderCard() {
  return render(<PremiumDownloadCard showId="show-1" />, {
    queryClient: createTestQueryClient(),
  });
}

describe('PremiumDownloadCard', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    generateMock.mockReset();
  });

  it('renders a primary publish action when no premium list is published', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: null,
        published_premium_at: null,
        updated_at: '2026-05-09T12:00:00.000Z',
      },
      error: null,
    });

    renderCard();

    expect(
      await screen.findByRole('button', { name: /generate & publish premium/i })
    ).toBeInTheDocument();
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
