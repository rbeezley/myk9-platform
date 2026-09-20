import { act, fireEvent, screen, waitFor } from '@/test/utils/testUtils';
import { createTestQueryClient, render } from '@/test/utils/testUtils';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePremiumPublishStore } from '../useGenerateAndPublishPremium';
import { PremiumDownloadCard } from '../PremiumDownloadCard';
import { publishInfoQueryKey } from '../usePublishInfo';
import { resetPremiumPublishCoordinatorForTests } from '../premiumPublishCoordinator';

const maybeSingleMock = vi.hoisted(() => vi.fn());
const generateMock = vi.hoisted(() => vi.fn());
const publishExperienceMock = vi.hoisted(() => vi.fn());
const notificationErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: 1, error: null })),
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
  publishExperience: publishExperienceMock,
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: notificationErrorMock,
  },
}));

function renderCard(
  showStaleBadge = false,
  showId = 'show-1',
  canManageShow = true,
  queryClient = createTestQueryClient()
) {
  return render(
    <PremiumDownloadCard
      showId={showId}
      showStaleBadge={showStaleBadge}
      canManageShow={canManageShow}
    />,
    {
      queryClient,
    }
  );
}

function createPlaceholderQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        placeholderData: (previousData: unknown) => previousData,
      },
    },
  });
}

describe('PremiumDownloadCard', () => {
  beforeEach(() => {
    // The publish flow's in-flight/failed state is a module-scope store now
    // (two triggers in two subtrees share it), so it has to be reset like any
    // other global between tests.
    usePremiumPublishStore.setState({ byShowId: {} });
    resetPremiumPublishCoordinatorForTests();
    maybeSingleMock.mockReset();
    generateMock.mockReset();
    publishExperienceMock.mockReset();
    notificationErrorMock.mockReset();
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

    expect(await screen.findByText('Premium PDF is not published yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate & publish premium/i })).toBeInTheDocument();
  });

  it('shows the offline reason beside the paused publish action', () => {
    onlineManager.setOnline(false);
    try {
      renderCard();

      expect(screen.getByRole('button', { name: /generate & publish premium/i })).toBeDisabled();
      expect(screen.getAllByText("You're offline — publishing needs a connection")).toHaveLength(2);
      expect(maybeSingleMock).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('keeps an authorized cached download visible while publishing is paused offline', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      publishInfoQueryKey('show-1'),
      {
        publishedUrl: 'https://example.test/cached-premium.pdf',
        publishedAt: '2026-05-09T12:00:00.000Z',
        updatedAt: '2026-05-09T12:00:00.000Z',
        experienceIsPublished: true,
      },
      { updatedAt: 0 }
    );

    onlineManager.setOnline(false);
    try {
      renderCard(false, 'show-1', true, queryClient);
      void queryClient.refetchQueries({ queryKey: publishInfoQueryKey('show-1') });

      expect(screen.getByRole('link', { name: /download pdf/i })).toHaveAttribute(
        'href',
        'https://example.test/cached-premium.pdf'
      );
      await waitFor(() =>
        expect(
          screen.getAllByText("You're offline — publishing needs a connection").length
        ).toBeGreaterThan(0)
      );
      expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('shows the loading reason while the online publish read is pending', () => {
    maybeSingleMock.mockReturnValue(new Promise(() => {}));

    renderCard();

    expect(screen.getByRole('button', { name: /generate & publish premium/i })).toBeDisabled();
    expect(screen.getAllByText('Checking the premium’s publish state…')).toHaveLength(2);
  });

  it('does not call an unresolved publish read', () => {
    renderCard(false, 'show-1', false);

    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(screen.getAllByText('Checking the premium’s publish state…')).toHaveLength(2);
  });

  it('does not show the unpublished copy after a failed publish read', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: new Error('read failed') });

    renderCard();

    expect(await screen.findAllByText('Publish state could not be read')).toHaveLength(2);
    expect(screen.queryByText('Premium PDF is not published yet')).not.toBeInTheDocument();
  });

  it('does not carry publish info from the previous show while the next read is pending', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          published_premium_url: 'https://example.test/show-a.pdf',
          published_premium_at: '2026-05-09T12:00:00.000Z',
          updated_at: '2026-05-09T12:00:00.000Z',
        },
        error: null,
      })
      .mockReturnValueOnce(new Promise(() => {}));
    const queryClient = createPlaceholderQueryClient();
    const view = renderCard(false, 'show-a', true, queryClient);

    expect(await screen.findByRole('link', { name: /download pdf/i })).toHaveAttribute(
      'href',
      'https://example.test/show-a.pdf'
    );

    view.rerender(
      <PremiumDownloadCard showId="show-b" showStaleBadge={false} canManageShow={true} />
    );

    expect(screen.getAllByText('Checking the premium’s publish state…')).toHaveLength(2);
    expect(screen.queryByText(/premium pdf published may 9, 2026/i)).not.toBeInTheDocument();
  });

  it('hides cached management state while scope is unresolved, then restores it when allowed', async () => {
    const queryClient = createPlaceholderQueryClient();
    queryClient.setQueryData(publishInfoQueryKey('show-a'), {
      publishedUrl: 'https://example.test/show-a.pdf',
      publishedAt: '2026-05-09T12:00:00.000Z',
      updatedAt: '2026-05-09T12:00:00.000Z',
      experienceIsPublished: true,
    });

    const view = renderCard(false, 'show-a', false, queryClient);

    expect(screen.queryByRole('link', { name: /download pdf/i })).toBeNull();
    expect(screen.getAllByText('Checking the premium’s publish state…')).toHaveLength(2);

    view.rerender(
      <PremiumDownloadCard showId="show-a" showStaleBadge={false} canManageShow={true} />
    );

    expect(await screen.findByRole('link', { name: /download pdf/i })).toHaveAttribute(
      'href',
      'https://example.test/show-a.pdf'
    );
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

  it('refreshes the published timestamp and clears the stale warning after republishing', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          published_premium_url: 'https://example.test/premium.pdf',
          published_premium_at: '2026-05-09T12:00:00.000Z',
          updated_at: '2026-05-09T12:05:01.000Z',
          experience_is_published: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          published_premium_url: 'https://example.test/premium.pdf',
          published_premium_at: '2026-05-10T12:06:00.000Z',
          updated_at: '2026-05-10T12:06:00.000Z',
          experience_is_published: true,
        },
        error: null,
      });
    generateMock.mockResolvedValue({});
    publishExperienceMock.mockResolvedValue({
      premiumUrl: 'https://example.test/premium.pdf',
      publishedAt: '2026-05-10T12:06:00.000Z',
    });

    const { user } = renderCard(true);
    await user.click(await screen.findByRole('button', { name: /republish premium/i }));

    await waitFor(() => {
      expect(screen.getByText(/premium pdf published may 10, 2026/i)).toBeInTheDocument();
      expect(screen.queryByText(/show data has changed since publish/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /republish premium/i })).not.toBeInTheDocument();
    });
  });

  it('preserves an authoritative stale warning from the refetched show row', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          published_premium_url: 'https://example.test/premium.pdf',
          published_premium_at: '2026-05-09T12:00:00.000Z',
          updated_at: '2026-05-09T12:05:01.000Z',
          experience_is_published: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          published_premium_url: 'https://example.test/premium.pdf',
          published_premium_at: '2026-05-10T12:06:00.000Z',
          updated_at: '2026-05-10T12:07:00.000Z',
          experience_is_published: true,
        },
        error: null,
      });
    generateMock.mockResolvedValue({});
    publishExperienceMock.mockResolvedValue({
      premiumUrl: 'https://example.test/premium.pdf',
      publishedAt: '2026-05-10T12:06:00.000Z',
    });

    const { user } = renderCard(true);
    await user.click(await screen.findByRole('button', { name: /republish premium/i }));

    await waitFor(() => {
      expect(screen.getByText(/show data has changed since publish/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /republish premium/i })).toBeInTheDocument();
    });
  });

  it('starts only one publish attempt for same-mount double-submit', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: null,
        published_premium_at: null,
        updated_at: '2026-05-09T12:00:00.000Z',
      },
      error: null,
    });
    let resolveGeneration: ((value: unknown) => void) | undefined;
    generateMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveGeneration = resolve;
        })
    );
    publishExperienceMock.mockResolvedValue({
      premiumUrl: 'https://example.test/premium.pdf',
      publishedAt: '2026-05-09T12:00:00.000Z',
    });

    renderCard();
    const button = await screen.findByRole('button', { name: /generate & publish premium/i });
    // The button is disabled until the publish read resolves: until then the
    // card cannot tell "not published" from "published and current", and
    // clicking would regenerate a live PDF. The double-submit latch this test
    // is about only applies once the control is genuinely usable.
    await waitFor(() => expect(button).toBeEnabled());

    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(generateMock).toHaveBeenCalledTimes(1);
    resolveGeneration?.({});
    await waitFor(() => expect(publishExperienceMock).toHaveBeenCalledTimes(1));
  });

  it('shows a secretary-friendly retry without exposing the failure payload', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: null,
        published_premium_at: null,
        updated_at: '2026-05-09T12:00:00.000Z',
      },
      error: null,
    });
    generateMock
      .mockRejectedValueOnce(
        new Error('Edge Function returned 500: {"detail":"permission denied"}')
      )
      .mockResolvedValueOnce({});
    publishExperienceMock.mockResolvedValue({
      premiumUrl: 'https://example.test/premium.pdf',
      publishedAt: '2026-05-09T12:01:00.000Z',
    });

    const { user } = renderCard();
    await user.click(await screen.findByRole('button', { name: /generate & publish premium/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /you do not have permission to publish this show's premium list/i
    );
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/permission denied|edge function returned 500/i)
    ).not.toBeInTheDocument();
    expect(notificationErrorMock).toHaveBeenCalledWith('Could not publish the premium list');

    await user.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => {
      expect(generateMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('shows specific guidance when the show organization is missing', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: null,
        published_premium_at: null,
        updated_at: '2026-05-09T12:00:00.000Z',
      },
      error: null,
    });
    generateMock.mockRejectedValueOnce(
      new Error('Premium generation is only supported for AKC and UKC shows (got: null)')
    );

    const { user } = renderCard();
    await user.click(await screen.findByRole('button', { name: /generate & publish premium/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /set this show's organization to akc or ukc in show settings/i
    );
  });

  it('disables retry while the publish read is paused offline', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_url: null,
        published_premium_at: null,
        updated_at: '2026-05-09T12:00:00.000Z',
      },
      error: null,
    });
    generateMock.mockRejectedValueOnce(new Error('publish failed'));

    const queryClient = createTestQueryClient();
    const { user } = renderCard(false, 'show-1', true, queryClient);
    await user.click(await screen.findByRole('button', { name: /generate & publish premium/i }));
    expect(await screen.findByRole('button', { name: /try again/i })).toBeEnabled();

    onlineManager.setOnline(false);
    try {
      await queryClient.refetchQueries({ queryKey: ['shows', 'show-1', 'publish-info'] });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /try again/i })).toBeDisabled()
      );
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('shows a secretary-friendly retry when publishing the experience fails and recovers', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          published_premium_url: null,
          published_premium_at: null,
          updated_at: '2026-05-09T12:00:00.000Z',
          experience_is_published: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          published_premium_url: 'https://example.test/premium.pdf',
          published_premium_at: '2026-05-09T12:01:00.000Z',
          updated_at: '2026-05-09T12:01:00.000Z',
          experience_is_published: true,
        },
        error: null,
      });
    generateMock.mockResolvedValue({});
    publishExperienceMock
      .mockRejectedValueOnce(new Error('Edge Function returned 500: {"detail":"db down"}'))
      .mockResolvedValueOnce({
        premiumUrl: 'https://example.test/premium.pdf',
        publishedAt: '2026-05-09T12:01:00.000Z',
      });

    const { user } = renderCard(true);
    await user.click(await screen.findByRole('button', { name: /generate & publish premium/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /we couldn't publish the premium list\. please try again\./i
    );
    // Assert the PROPERTY, not one spelling of it. This pinned the literal
    // `min-h-[44px]` from #1424, so moving the button onto the `touch` variant —
    // which gives min-h-11 (44px) and min-h-12 (48px) on tablet, i.e. strictly
    // better — failed a test whose intent it satisfied. A pin that bans one
    // class lets every other spelling through, including smaller ones.
    const retry = screen.getByRole('button', { name: /try again/i });
    expect(retry.className).toMatch(/min-h-(?:11|12|\[(?:4[4-9]|[5-9]\d)px\])/);
    expect(screen.queryByText(/db down|edge function returned 500/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(generateMock).toHaveBeenCalledTimes(1);
      expect(publishExperienceMock).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('link', { name: /download pdf/i })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
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
