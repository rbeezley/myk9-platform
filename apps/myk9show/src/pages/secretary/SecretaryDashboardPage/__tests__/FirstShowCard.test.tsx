import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { FirstShowCard } from '../FirstShowCard';
import { firstShowCandidateClubIds, type FirstShowState } from '../firstShowClub';
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

const ready = (draftShowId: string | null = null): FirstShowState => ({
  state: 'ready',
  publishedEver: false,
  draftShowId,
});

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
    render(<FirstShowCard clubId="club-1" firstShow={ready()} />);

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
    render(<FirstShowCard clubId="club-1" firstShow={ready('show-7')} />);
    expect(screen.getByRole('link', { name: 'Continue your draft show' })).toHaveAttribute(
      'href',
      '/shows/show-7'
    );
    expect(screen.queryByText('Create your first show')).not.toBeInTheDocument();
  });

  it('renders nothing once the club has published before', () => {
    render(
      <FirstShowCard
        clubId="club-1"
        firstShow={{ state: 'ready', publishedEver: true, draftShowId: 'show-7' }}
      />
    );
    expect(screen.queryByTestId('first-show-card')).not.toBeInTheDocument();
  });

  it.each([
    ['checking', { state: 'checking' }, /checking/i],
    ['offline', { state: 'offline' }, /you are offline/i],
    ['failed', { state: 'failed', retry: vi.fn() }, /could not check/i],
  ] as const)(
    'shows that state, with no all-clear and no create or continue link, when the first-show check is %s',
    (_name, firstShow, text) => {
      // The blockers read is ready and empty: only the first-show state can speak here.
      render(<FirstShowCard clubId="club-1" firstShow={firstShow} />);
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.queryByText(/nothing is holding your club back/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /create your first show/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /continue your draft show/i })
      ).not.toBeInTheDocument();
    }
  );

  it.each([
    ['offline', { state: 'offline', blockers: [] }, /you are offline/i],
    ['failed', { state: 'failed', blockers: [], retry: vi.fn() }, /could not check/i],
  ])('reads the shared list when the blockers check is %s', (_name, state, text) => {
    harness.club = state;
    render(<FirstShowCard clubId="club-1" firstShow={ready()} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/nothing is holding your club back/i)).not.toBeInTheDocument();
  });
});

describe('firstShowCandidateClubIds', () => {
  const scopes = [{ scopeType: ScopeType.CLUB, scopeId: 'club-1', roleId: UserRole.CLUB_ADMIN }];

  it('lists the clubs she runs', () => {
    expect(firstShowCandidateClubIds(scopes)).toEqual(['club-1']);
    expect(firstShowCandidateClubIds(undefined)).toEqual([]);
  });

  it('ignores clubs she only belongs to', () => {
    expect(firstShowCandidateClubIds([{ ...scopes[0]!, roleId: UserRole.EXHIBITOR }])).toEqual([]);
  });

  it('puts the club she just added first, only if she runs it', () => {
    const two = [
      { scopeType: ScopeType.CLUB, scopeId: 'club-1', roleId: UserRole.CLUB_ADMIN },
      { scopeType: ScopeType.CLUB, scopeId: 'club-2', roleId: UserRole.CLUB_ADMIN },
    ];
    expect(firstShowCandidateClubIds(two, 'club-2')).toEqual(['club-2', 'club-1']);
    expect(firstShowCandidateClubIds(two, 'club-9')).toEqual(['club-1', 'club-2']);
  });
});
