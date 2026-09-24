import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';

import { ShowDeskCompactContext } from '../ShowDeskCompactContext';

const mocks = vi.hoisted(() => ({
  publishInfo: {
    publishedLocator: 'https://example.com/premium.pdf' as string | null,
    hasPublishedPremium: true,
    publishedPath: null as string | null,
    publishedAt: '2026-07-20T12:00:00.000Z' as string | null,
    updatedAt: '2026-07-20T12:00:00.000Z' as string | null,
    experienceIsPublished: true as boolean | null,
    versionedSchemaAvailable: true,
  },
  sync: {
    status: 'synced' as 'synced' | 'pending' | 'offline' | 'error' | 'conflict',
    queueSize: 0,
    isOnline: true,
    conflictCount: 0,
    errorCount: 0,
  },
}));

vi.mock('@/features/premium/usePublishInfo', () => ({
  usePublishInfo: (_showId: string, canManageShow: boolean) => ({
    data: canManageShow ? mocks.publishInfo : undefined,
  }),
}));
vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => mocks.sync,
}));
vi.mock('@/components/shows/ArmbandLookup', () => ({ ArmbandLookup: () => null }));
vi.mock('@/components/shows/ShowStatusPill', () => ({
  ShowStatusPill: ({ clubId }: { clubId?: string }) => (
    <div data-testid="status-pill" data-club-id={clubId} />
  ),
}));
vi.mock('@/features/show-live-sync/LiveUpdateIndicator', () => ({
  LiveUpdateIndicator: () => null,
}));
vi.mock('@/features/show-presence/ShowPresenceStack', () => ({ ShowPresenceStack: () => null }));

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  startDate: '2026-07-20',
  endDate: '2026-07-21',
  status: 'In Progress',
  clubId: 'club-1',
} as Show;

function renderContext() {
  return render(
    <ShowDeskCompactContext
      show={show}
      canonicalShowHref="/shows/show-1"
      armbandCount={0}
      canManageShow={true}
    />
  );
}

describe('ShowDeskCompactContext', () => {
  beforeEach(() => {
    mocks.publishInfo.publishedLocator = 'https://example.com/premium.pdf';
    mocks.publishInfo.publishedAt = '2026-07-20T12:00:00.000Z';
    mocks.publishInfo.updatedAt = '2026-07-20T12:00:00.000Z';
    mocks.sync.status = 'synced';
    mocks.sync.queueSize = 0;
    mocks.sync.isOnline = true;
  });

  it('no longer carries its own overflow menu', () => {
    // The Show Desk twin of the show header's `...` menu is deleted with it
    // (MYK9-630); the header Actions menu is the one place now.
    renderContext();
    expect(screen.queryByRole('button', { name: /more show actions/i })).toBeNull();
  });

  it('keeps the canonical Overview reachable from Show Desk context', () => {
    renderContext();

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/shows/show-1');
  });

  it('gives the compact status control the host club required for publishing', () => {
    renderContext();
    expect(screen.getByTestId('status-pill')).toHaveAttribute('data-club-id', 'club-1');
  });

  it('shows a compact resolving exception when the premium is unpublished', () => {
    mocks.publishInfo.publishedLocator = null;
    mocks.publishInfo.hasPublishedPremium = false;
    mocks.publishInfo.publishedAt = null;

    renderContext();

    expect(screen.getByText('Premium list is not published')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review show details/i })).toHaveAttribute(
      'href',
      '/shows/show-1#setup-publish'
    );
  });

  it('does not mark durable published metadata as unpublished', () => {
    mocks.publishInfo.publishedLocator = 'show-1/artifact-1.pdf';
    mocks.publishInfo.hasPublishedPremium = true;
    mocks.publishInfo.publishedAt = '2026-07-20T12:00:00.000Z';
    mocks.publishInfo.updatedAt = '2026-07-20T12:00:00.000Z';

    renderContext();

    expect(screen.queryByText('Premium list is not published')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Show data changed after the premium was published')
    ).not.toBeInTheDocument();
  });

  it('does not expose cached publish state while management scope is denied', () => {
    render(
      <ShowDeskCompactContext
        show={show}
        canonicalShowHref="/shows/show-1"
        armbandCount={0}
        canManageShow={false}
      />
    );

    expect(screen.queryByText('Premium list is not published')).toBeNull();
    expect(screen.queryByText(/show data changed after publish/i)).toBeNull();
  });

  it('uses calm, truthful offline and pending-save wording', () => {
    mocks.sync.status = 'offline';
    mocks.sync.isOnline = false;
    const { rerender } = renderContext();

    expect(screen.getByRole('status')).toHaveTextContent('Offline · changes saved on this device');

    mocks.sync.status = 'pending';
    mocks.sync.isOnline = true;
    mocks.sync.queueSize = 2;
    rerender(
      <ShowDeskCompactContext
        show={show}
        canonicalShowHref="/shows/show-1"
        armbandCount={0}
        canManageShow={true}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('2 changes saved on this device');
  });
});
