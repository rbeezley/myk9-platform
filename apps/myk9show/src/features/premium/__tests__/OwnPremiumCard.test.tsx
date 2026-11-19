/**
 * MYK9-2054: the club's own premium card never lets an unreadable or announcement-only state
 * look like "nothing published", and reports a failed download.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

const state = vi.hoisted(() => ({
  info: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  link: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  open: vi.fn(),
}));

vi.mock('../usePublishInfo', () => ({
  usePublishInfo: () => state.info,
  openPublishedPremium: (...args: unknown[]) => state.open(...args),
}));
vi.mock('../ownPremium', async importOriginal => ({
  ...(await importOriginal<typeof import('../ownPremium')>()),
  useOwnPremiumLink: () => state.link,
  useRefreshPremiumState: () => vi.fn(),
}));

import { OwnPremiumCard } from '../OwnPremiumCard';

describe('OwnPremiumCard', () => {
  beforeEach(() => {
    state.info = { data: undefined, isError: false, refetch: vi.fn() };
    state.link = { data: null, isError: false, refetch: vi.fn() };
    state.open.mockReset();
  });

  it('says it could not check, offers Try again and keeps Unpublish when a read fails', () => {
    state.link = { data: undefined, isError: true, refetch: vi.fn() };
    render(<OwnPremiumCard showId="show-1" canManageShow />);

    expect(screen.getByText('Could not check what is published right now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.link.refetch).toHaveBeenCalled();
  });

  it('offers Unpublish when only the announcement is live', () => {
    state.info = {
      data: { hasPublishedPremium: false, experienceIsPublished: true, publishedAt: null },
      isError: false,
      refetch: vi.fn(),
    };
    render(<OwnPremiumCard showId="show-1" canManageShow />);

    expect(screen.getByText(/public announcement is live/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeTruthy();
  });

  it('shows no Unpublish when nothing is published and every read succeeded', () => {
    state.info = {
      data: { hasPublishedPremium: false, experienceIsPublished: false, publishedAt: null },
      isError: false,
      refetch: vi.fn(),
    };
    render(<OwnPremiumCard showId="show-1" canManageShow />);
    expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull();
  });

  it('reports a download that could not open', async () => {
    state.info = {
      data: {
        hasPublishedPremium: true,
        experienceIsPublished: true,
        publishedAt: '2026-11-01T00:00:00Z',
      },
      isError: false,
      refetch: vi.fn(),
    };
    state.open.mockResolvedValue(false);
    render(<OwnPremiumCard showId="show-1" canManageShow />);

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't prepare"));
  });
});
