import React from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { AboutTab } from '../AboutTab';
import { ClubHeader } from '../ClubHeader';

vi.mock('@/components/ui/cover-image-upload', () => ({
  CoverImageUpload: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// MYK9-860: the officials line reads through useClubOfficials ->
// getClubOfficials. Mocked (default empty) so the "populated" test proves the
// line renders when the real hook resolves, not just when handed props. The
// hook skips guests, so the viewer is signed in unless a test says otherwise.
vi.mock('@/services/database/club-memberships', () => ({
  getClubOfficials: vi.fn().mockResolvedValue({ adminNames: [], secretaryNames: [] }),
}));

vi.mock('@/hooks/useAuthContext', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useAuthContext')>()),
  useAuthContext: vi.fn(() => ({ user: { id: 'auth-1' } })),
}));

import { getClubOfficials } from '@/services/database/club-memberships';
import { useAuthContext } from '@/hooks/useAuthContext';

const baseClub: Club = {
  id: 'club-1',
  name: 'Heartland Club',
  clubNumber: 'HC-1',
  email: '',
  phone: '',
  website: undefined,
  description: '',
  address: { street: '', city: 'Tulsa', state: 'OK', zipCode: '', country: 'US' },
  logo: '',
  coverImage: '',
  accentColor: '',
  upcomingShows: [],
  pastShows: [],
};

const noop = () => undefined;

describe('club page-level actions (MYK9-928; CRUD standard decision 6)', () => {
  it('renders no Edit button and no ⋮ menu for any viewer: every action is in the header menu', () => {
    render(
      <ClubHeader
        club={{ ...baseClub, email: 'club@example.test' }}
        onEditPhoto={noop}
        canEditBranding
        canAuthorizeClub
        isClubAuthorized={false}
      />
    );

    // Positive control: the card rendered, unauthorized badge and all.
    expect(screen.getByRole('heading', { level: 1, name: 'Heartland Club' })).toBeInTheDocument();
    expect(screen.getByTestId('club-unauthorized-badge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Club options' })).not.toBeInTheDocument();
    expect(screen.queryByText('Authorize Club')).not.toBeInTheDocument();
  });
});

describe('club hero (MYK9-930)', () => {
  const heroClub: Club = {
    ...baseClub,
    founded: new Date(2008, 5, 1),
    clubType: 'scent' as Club['clubType'],
  };

  it('owns the page h1 with the club name', () => {
    render(<ClubHeader club={heroClub} onEditPhoto={noop} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Heartland Club' })).toBeInTheDocument();
  });

  it('carries the facts row: location, club number, club type and founding year', () => {
    render(<ClubHeader club={heroClub} onEditPhoto={noop} />);
    expect(screen.getByText('Tulsa, OK')).toBeInTheDocument();
    expect(screen.getByText('Club #HC-1')).toBeInTheDocument();
    expect(screen.getByText(/scent club/i)).toBeInTheDocument();
    expect(screen.getByText('Founded 2008')).toBeInTheDocument();
  });

  it('hides facts the club has not filled in (an optional blank field is hidden)', () => {
    render(
      <ClubHeader
        club={{ ...baseClub, clubNumber: undefined, address: undefined } as unknown as Club}
        onEditPhoto={noop}
      />
    );
    expect(screen.queryByText(/club #/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Not set')).not.toBeInTheDocument();
  });

  it('keeps the cover banner and accent bar inside the hero card', () => {
    render(<ClubHeader club={{ ...heroClub, accentColor: '#336699' }} onEditPhoto={noop} />);
    expect(screen.getByTestId('gradient-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('accent-bar')).toBeInTheDocument();
  });

  it('renders no visible action buttons: contact links are on About, actions in the header menu', () => {
    render(
      <ClubHeader
        club={{ ...heroClub, email: 'a@b.example', phone: '555-0100' }}
        onEditPhoto={noop}

        canEditBranding
      />
    );
    expect(screen.queryByRole('button', { name: /^email$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^call$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Club options' })).not.toBeInTheDocument();
  });
});

describe('club contact actions', () => {
  it('omits the options menu and contact actions when contact values are absent', () => {
    render(<ClubHeader club={baseClub} onEditPhoto={noop} />);

    expect(screen.queryByRole('button', { name: 'Club options' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /call/i })).not.toBeInTheDocument();
  });

  it('renders only the usable partial contact destinations, as About links', () => {
    const club = { ...baseClub, email: ' contact@heartland.example ', phone: '   ' };

    render(
      <>
        <ClubHeader club={club} onEditPhoto={noop} />
        <AboutTab club={club} />
      </>
    );

    // The card no longer repeats them in a menu; About is where they live.
    expect(screen.queryByText('Email Club')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contact@heartland.example' })).toHaveAttribute(
      'href',
      'mailto:contact@heartland.example'
    );
    expect(screen.queryByRole('link', { name: /website/i })).not.toBeInTheDocument();
  });
});

// MYK9-572: site-admin-only authorize/revoke AFFORDANCE; the Unauthorized
// badge itself is visible to any viewer who can see the club at all (P2-B).
// The Authorize / Revoke ACTION is the header Actions menu's (clubPageActions.test.ts,
// RevokeClubAuthorizationDialog.test.tsx); the card keeps the badge and the notice.
describe('club authorization control', () => {
  it('shows the badge for a non-site-admin viewer of an unauthorized club', () => {
    // P2-B: the club's own admin/secretary needs to know publish is blocked
    // just as much as a site admin does.
    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}

        canEditBranding
        canAuthorizeClub={false}
        isClubAuthorized={false}
      />
    );

    expect(screen.getByTestId('club-unauthorized-badge')).toBeInTheDocument();
    expect(screen.queryByText('Authorize Club')).not.toBeInTheDocument();
    expect(screen.queryByText('Revoke Authorization')).not.toBeInTheDocument();
  });

  // MYK9-855: the badge's explanation lived only in a hover `title`, invisible
  // on touch devices and easy to miss. A non-site-admin requester must see,
  // in plain visible text, what is pending and that a myK9 operator (not
  // them) acts next — a site admin instead sees that THEY can act now.
  it('shows a visible plain-words notice, not just the hover badge, for a non-site-admin viewer', () => {
    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}

        canAuthorizeClub={false}
        isClubAuthorized={false}
      />
    );

    const notice = screen.getByTestId('club-unauthorized-notice');
    expect(notice).toHaveTextContent(/myk9 operator/i);
    expect(notice).not.toHaveTextContent(/menu/i);
  });

  it('shows a visible notice pointing a site admin at the menu action, for an unauthorized club', () => {
    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}

        canAuthorizeClub
        isClubAuthorized={false}
      />
    );

    const notice = screen.getByTestId('club-unauthorized-notice');
    expect(notice).toHaveTextContent(/authorize this club from the actions menu/i);
    expect(notice).not.toHaveTextContent(/myk9 operator/i);
  });

  it('shows no unauthorized notice for an authorized club', () => {
    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}

        canAuthorizeClub={false}
        isClubAuthorized
      />
    );

    expect(screen.queryByTestId('club-unauthorized-notice')).not.toBeInTheDocument();
  });

  it('shows no badge for an authorized club, regardless of viewer', () => {
    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}

        canAuthorizeClub={false}
        isClubAuthorized
      />
    );

    expect(screen.queryByTestId('club-unauthorized-badge')).not.toBeInTheDocument();
  });

  it('shows no badge while authorization status is loading', () => {
    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}

        canAuthorizeClub
        isClubAuthorized={undefined}
      />
    );

    expect(screen.queryByTestId('club-unauthorized-badge')).not.toBeInTheDocument();
  });
});

// MYK9-860 — proves the real wiring (useClubOfficials -> getClubOfficials ->
// ClubOfficialsLine), not just the presentational component in isolation.
describe('club officials line', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as Mock).mockImplementation(() => ({ user: { id: 'auth-1' } }));
  });

  it('shows every admin and secretary once the real data path resolves', async () => {
    (getClubOfficials as Mock).mockResolvedValueOnce({
      adminNames: ['Jane Doe', 'John Smith'],
      secretaryNames: ['Pat Lee'],
    });

    render(<ClubHeader club={baseClub} onEditPhoto={noop} />);

    expect(await screen.findByTestId('club-admin-names')).toHaveTextContent(
      'Admins: Jane Doe, John Smith'
    );
    expect(screen.getByTestId('club-secretary-names')).toHaveTextContent('Secretary: Pat Lee');
  });

  it('renders nothing when this viewer gets no officials back', async () => {
    render(<ClubHeader club={baseClub} onEditPhoto={noop} />);

    await waitFor(() => expect(getClubOfficials).toHaveBeenCalledWith(baseClub.id));
    expect(screen.queryByTestId('club-admin-names')).not.toBeInTheDocument();
    expect(screen.queryByTestId('club-secretary-names')).not.toBeInTheDocument();
  });

  it('shows a retryable error when officials cannot load', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    (getClubOfficials as Mock)
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ adminNames: ['Jane Doe'], secretaryNames: [] });

    render(<ClubHeader club={baseClub} onEditPhoto={noop} />);

    expect(await screen.findByRole('alert')).toHaveTextContent("Club officials couldn't load.");
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('club-admin-names')).toHaveTextContent('Admin: Jane Doe');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not ask for officials on behalf of a signed-out guest', () => {
    (useAuthContext as Mock).mockImplementation(() => ({ user: null }));

    render(<ClubHeader club={baseClub} onEditPhoto={noop} />);

    expect(getClubOfficials).not.toHaveBeenCalled();
    expect(screen.queryByTestId('club-admin-names')).not.toBeInTheDocument();
  });
});
