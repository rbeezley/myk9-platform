import { screen } from '@/test/utils/testUtils';
import { createTestQueryClient, render } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { PublishReadinessBlock } from '../PublishReadinessBlock';

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

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Heartland Classic',
    organization: 'Heartland Club',
    startDate: '2026-08-01',
    endDate: '2026-08-03',
    location: 'Springfield, IL',
    status: 'published',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2026-07-01',
    entryCloseDate: '2026-07-20',
    preEntryFee: '30',
    clubId: 'club-1',
    clubName: 'Heartland Club',
    clubAddress: '',
    clubEmail: '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
    experienceIsPublished: true,
    ...overrides,
  };
}

describe('PublishReadinessBlock', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
  });

  it('reflects a published premium PDF even when the show prop carries no premium fields', async () => {
    // Regression: the `show` prop comes from the offline-replicated table on
    // the Setup page, which never carries published_premium_url/at. Without
    // fetching that data directly, this block silently reported "Premium
    // PDF is not published yet" for shows that were actually published.
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: 'https://example.test/premium.pdf',
        published_premium_at: '2026-07-01T12:00:00.000Z',
        updated_at: '2026-07-01T12:00:00.000Z',
      },
      error: null,
    });

    render(
      <PublishReadinessBlock
        show={show({ publishedPremiumUrl: null, publishedPremiumAt: null })}
      />,
      {
        queryClient: createTestQueryClient(),
      }
    );

    expect(await screen.findByText('Premium PDF is published')).toBeInTheDocument();
    expect(screen.queryByText('Premium PDF is not published yet')).not.toBeInTheDocument();
  });

  it('surfaces the needs-republish state when the fetched premium data is stale', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: 'https://example.test/premium.pdf',
        published_premium_at: '2026-07-01T12:00:00.000Z',
        updated_at: '2026-07-01T12:05:30.000Z',
      },
      error: null,
    });

    render(
      <PublishReadinessBlock
        show={show({ publishedPremiumUrl: null, publishedPremiumAt: null })}
      />,
      {
        queryClient: createTestQueryClient(),
      }
    );

    expect(await screen.findByText('Premium PDF needs republish')).toBeInTheDocument();
  });
});
