import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { FirstShowCard } from '../FirstShowCard';
import { findFirstShowClub } from '../firstShowClub';
import { ScopeType, UserRole } from '@/types/auth-types';
import type { PublishBlockersState } from '@/features/publishing/usePublishBlockers';

const harness = vi.hoisted(() => ({ club: undefined as unknown, canOpenPayments: false }));

vi.mock('@/features/publishing/usePublishBlockers', () => ({
  useClubPublishBlockers: () => harness.club,
}));
vi.mock('@/features/payments/useCanOpenClubPayments', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/payments/useCanOpenClubPayments')>()),
  useCanOpenClubPayments: () => harness.canOpenPayments,
}));

beforeEach(() => {
  harness.club = { state: 'ready', blockers: [] } satisfies PublishBlockersState;
  harness.canOpenPayments = false;
});

describe('FirstShowCard (MYK9-2199)', () => {
  it('shows the club lines and a way to create the first show', () => {
    harness.canOpenPayments = true;
    harness.club = {
      state: 'ready',
      blockers: [
        { key: 'club_not_approved', waitingOn: 'myk9', eta: 'about a day' },
        { key: 'payouts_not_enabled', waitingOn: 'club_admin', eta: null },
      ],
    };
    render(<FirstShowCard clubId="club-1" />);

    expect(screen.getByText('Get your first show published')).toBeInTheDocument();
    expect(screen.getByText(/waiting for myK9Show approval/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /fix it: your club has not finished/i })
    ).toHaveAttribute('href', '/clubs/club-1?tab=payments');
    expect(screen.getByRole('link', { name: 'Create your first show' })).toHaveAttribute(
      'href',
      '/secretary/create-show/wizard?clubId=club-1'
    );
  });

  it('continues the draft when the club already has one', () => {
    render(<FirstShowCard clubId="club-1" draftShowId="show-7" />);
    expect(screen.getByRole('link', { name: 'Continue your draft show' })).toHaveAttribute(
      'href',
      '/shows/show-7'
    );
    expect(screen.queryByText('Create your first show')).not.toBeInTheDocument();
  });

  it.each([
    ['offline', { state: 'offline', blockers: [] }, /you are offline/i],
    ['failed', { state: 'failed', blockers: [], retry: vi.fn() }, /could not check/i],
  ])('reads the shared list when the check is %s', (_name, state, text) => {
    harness.club = state;
    render(<FirstShowCard clubId="club-1" />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/nothing is holding your club back/i)).not.toBeInTheDocument();
  });
});

describe('findFirstShowClub', () => {
  const scopes = [{ scopeType: ScopeType.CLUB, scopeId: 'club-1', roleId: UserRole.CLUB_ADMIN }];
  const show = (status: string, id = 's1') => ({ id, clubId: 'club-1', status });

  it('finds a club with no shows, and carries its draft', () => {
    expect(findFirstShowClub(scopes, [])).toEqual({ clubId: 'club-1', draftShowId: undefined });
    expect(findFirstShowClub(scopes, [show('draft', 's9')])).toEqual({
      clubId: 'club-1',
      draftShowId: 's9',
    });
  });

  it('is gone once any club show is public', () => {
    for (const status of ['published', 'upcoming', 'in_progress', 'completed']) {
      expect(findFirstShowClub(scopes, [show('draft', 's2'), show(status)])).toBeNull();
    }
  });

  it('ignores clubs she only belongs to', () => {
    expect(findFirstShowClub([{ ...scopes[0]!, roleId: UserRole.EXHIBITOR }], [])).toBeNull();
  });
});
