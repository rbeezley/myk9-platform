import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';

import { ShowDeskCompactContext } from '../ShowDeskCompactContext';

const mocks = vi.hoisted(() => ({
  publishInfo: {
    publishedUrl: 'https://example.com/premium.pdf' as string | null,
    publishedAt: '2026-07-20T12:00:00.000Z' as string | null,
    updatedAt: '2026-07-20T12:00:00.000Z' as string | null,
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
  usePublishInfo: () => ({ data: mocks.publishInfo }),
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
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

describe('ShowDeskCompactContext', () => {
  beforeEach(() => {
    mocks.publishInfo.publishedUrl = 'https://example.com/premium.pdf';
    mocks.publishInfo.publishedAt = '2026-07-20T12:00:00.000Z';
    mocks.publishInfo.updatedAt = '2026-07-20T12:00:00.000Z';
    mocks.sync.status = 'synced';
    mocks.sync.queueSize = 0;
    mocks.sync.isOnline = true;
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
    mocks.publishInfo.publishedUrl = null;
    mocks.publishInfo.publishedAt = null;

    renderContext();

    expect(screen.getByText('Premium list is not published')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review show details/i })).toHaveAttribute(
      'href',
      '/shows/show-1#setup-publish'
    );
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
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('2 changes saved on this device');
  });
});
