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

function renderCard(showStaleBadge = false) {
  return render(<PremiumDownloadCard showId="show-1" showStaleBadge={showStaleBadge} />, {
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
    expect(screen.getByText('Premium PDF is not published yet')).toBeInTheDocument();
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
    expect(screen.getByText(/premium pdf published may 9, 2026/i)).toBeInTheDocument();
  });

  it('surfaces a republish action when published premium data is stale', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: 'https://example.test/premium.pdf',
        published_premium_at: '2026-05-09T12:00:00.000Z',
        updated_at: '2026-05-09T12:05:01.000Z',
      },
      error: null,
    });

    renderCard(true);

    expect(await screen.findByRole('button', { name: /republish premium/i })).toBeInTheDocument();
    expect(screen.getByText(/show data has changed since publish/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download pdf/i })).toBeInTheDocument();
  });

  it('offers a publish action when the PDF is current but the landing page is unpublished', async () => {
    // publishExperience publishes the PDF first, then the experience
    // snapshot; if the snapshot write failed the PDF is current while the
    // landing page is still unpublished. The Setup tab's "Landing page not
    // published" chip deep-links here, so this card must expose the action
    // that clears that state.
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: 'https://example.test/premium.pdf',
        published_premium_at: '2026-05-09T12:00:00.000Z',
        updated_at: '2026-05-09T12:00:00.000Z',
        experience_is_published: false,
      },
      error: null,
    });

    renderCard(true);

    expect(
      await screen.findByRole('button', { name: /publish landing page/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/landing page not published/i)).toBeInTheDocument();
  });

  it('shows no republish action when the PDF is current and the landing page is published', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: 'https://example.test/premium.pdf',
        published_premium_at: '2026-05-09T12:00:00.000Z',
        updated_at: '2026-05-09T12:00:00.000Z',
        experience_is_published: true,
      },
      error: null,
    });

    renderCard(true);

    expect(await screen.findByRole('link', { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
