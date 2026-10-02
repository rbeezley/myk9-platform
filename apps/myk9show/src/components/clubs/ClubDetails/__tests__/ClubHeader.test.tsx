import React from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
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

describe('club page-level actions (MYK9-928)', () => {
  it('renders no Edit button even for a viewer who can edit: Edit club is in the Actions menu', () => {
    render(
      <ClubHeader
        club={baseClub}
        onEditPhoto={noop}
        onDeleteClub={noop}
        canEditBranding
        canDeleteClub
      />
    );

    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
    // Positive control: the header did render its overflow menu for this viewer.
    expect(screen.getByRole('button', { name: 'Club options' })).toBeInTheDocument();
  });
});

describe('club hero (MYK9-930)', () => {
  const heroClub: Club = {
    ...baseClub,
    founded: new Date(2008, 5, 1),
    clubType: 'scent' as Club['clubType'],
  };

  it('owns the page h1 with the club name', () => {
    render(<ClubHeader club={heroClub} onEditPhoto={noop} onDeleteClub={noop} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Heartland Club' })).toBeInTheDocument();
  });

  it('carries the facts row: location, club number, club type and founding year', () => {
    render(<ClubHeader club={heroClub} onEditPhoto={noop} onDeleteClub={noop} />);
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
        onDeleteClub={noop}
      />
    );
    expect(screen.queryByText(/club #/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Not set')).not.toBeInTheDocument();
  });

  it('keeps the cover banner and accent bar inside the hero card', () => {
    render(
      <ClubHeader
        club={{ ...heroClub, accentColor: '#336699' }}
        onEditPhoto={noop}
        onDeleteClub={noop}
      />
    );
    expect(screen.getByTestId('gradient-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('accent-bar')).toBeInTheDocument();
  });

  it('renders no visible action buttons: contact and photo actions live in the options menu', () => {
    render(
      <ClubHeader
        club={{ ...heroClub, email: 'a@b.example', phone: '555-0100' }}
        onEditPhoto={noop}
        onDeleteClub={noop}
        canEditBranding
      />
    );
    expect(screen.queryByRole('button', { name: /^email$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^call$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Club options' })).toBeInTheDocument();
  });
});

describe('club contact actions', () => {
  it('omits the options menu and contact actions when contact values are absent', () => {
    render(<ClubHeader club={baseClub} onEditPhoto={noop} onDeleteClub={noop} />);

    expect(screen.queryByRole('button', { name: 'Club options' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /call/i })).not.toBeInTheDocument();
  });

  it('renders only the usable partial contact destinations', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const club = { ...baseClub, email: ' contact@heartland.example ', phone: '   ' };

    render(
      <>
        <ClubHeader club={club} onEditPhoto={noop} onDeleteClub={noop} />
        <AboutTab club={club} />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'Club options' }));
    expect(await screen.findByText('Email Club')).toBeInTheDocument();
    expect(screen.queryByText('Call Club')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contact@heartland.example' })).toHaveAttribute(
      'href',
      'mailto:contact@heartland.example'
    );
    expect(screen.queryByRole('link', { name: /website/i })).not.toBeInTheDocument();
  });
});

// MYK9-572: site-admin-only authorize/revoke AFFORDANCE; the Unauthorized
// badge itself is visible to any viewer who can see the club at all (P2-B).
describe('club authorization control', () => {
  it('shows an Unauthorized badge and an Authorize Club menu item for a site admin viewing an unauthorized club', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onAuthorizeClub = vi.fn();

    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}
        onDeleteClub={noop}
        canAuthorizeClub
        isClubAuthorized={false}
        onAuthorizeClub={onAuthorizeClub}
      />
    );

    expect(screen.getByTestId('club-unauthorized-badge')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Club options' }));
    await user.click(await screen.findByText('Authorize Club'));

    expect(onAuthorizeClub).toHaveBeenCalledTimes(1);
  });

  it('shows a Revoke Authorization menu item (behind a confirm dialog), and no badge, for an authorized club', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onRevokeAuthorization = vi.fn();

    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}
        onDeleteClub={noop}
        canAuthorizeClub
        isClubAuthorized
        onRevokeAuthorization={onRevokeAuthorization}
      />
    );

    expect(screen.queryByTestId('club-unauthorized-badge')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Club options' }));
    await user.click(await screen.findByText('Revoke Authorization'));

    // P3-C: revoking is destructive to the club's publish ability, so it now
    // sits behind a confirm dialog rather than firing straight from the
    // dropdown item.
    expect(onRevokeAuthorization).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    // MYK9-572 round 4 (P2-3): the confirm copy must describe what actually
    // happens (stops NEW publishes; already-published shows stay visible),
    // not the earlier "hidden from the directory" claim.
    expect(within(dialog).getByText(/stop .* from publishing new shows/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/stays visible wherever it already has a published show/i)
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Revoke Authorization' }));

    expect(onRevokeAuthorization).toHaveBeenCalledTimes(1);
  });

  it('does not call onRevokeAuthorization when the confirm dialog is cancelled', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onRevokeAuthorization = vi.fn();

    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}
        onDeleteClub={noop}
        canAuthorizeClub
        isClubAuthorized
        onRevokeAuthorization={onRevokeAuthorization}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Club options' }));
    await user.click(await screen.findByText('Revoke Authorization'));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onRevokeAuthorization).not.toHaveBeenCalled();
  });

  it('omits the leading separator when the authorize item is the only menu entry', async () => {
    // P3-3: the separator before Authorize/Revoke should only render when
    // something else precedes it (branding edit or contact actions) — a
    // club with no branding/contact affordances and only the authorize
    // action must not show a leading divider with nothing above it.
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}
        onDeleteClub={noop}
        canAuthorizeClub
        isClubAuthorized={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Club options' }));
    await screen.findByText('Authorize Club');

    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('shows the badge (but no menu item) for a non-site-admin viewer of an unauthorized club', () => {
    // P2-B: the club's own admin/secretary needs to know publish is blocked
    // just as much as a site admin does — canDeleteClub is forced true here
    // only so the options menu renders at all (contact-less baseClub has no
    // other menu action), to prove Authorize Club specifically is absent.
    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}
        onDeleteClub={noop}
        canDeleteClub
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
        onDeleteClub={noop}
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
        onDeleteClub={noop}
        canAuthorizeClub
        isClubAuthorized={false}
      />
    );

    const notice = screen.getByTestId('club-unauthorized-notice');
    expect(notice).toHaveTextContent(/authorize this club/i);
    expect(notice).not.toHaveTextContent(/myk9 operator/i);
  });

  it('shows no unauthorized notice for an authorized club', () => {
    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}
        onDeleteClub={noop}
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
        onDeleteClub={noop}
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
        onDeleteClub={noop}
        canAuthorizeClub
        isClubAuthorized={undefined}
        isAuthorizationLoading
      />
    );

    expect(screen.queryByTestId('club-unauthorized-badge')).not.toBeInTheDocument();
  });

  it('disables the Authorize/Revoke menu items while an update is in flight', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    render(
      <ClubHeader
        club={baseClub}

        onEditPhoto={noop}
        onDeleteClub={noop}
        canAuthorizeClub
        isClubAuthorized={false}
        isAuthorizationUpdating
      />
    );

    await user.click(screen.getByRole('button', { name: 'Club options' }));
    expect(await screen.findByText('Authorize Club')).toHaveAttribute('aria-disabled', 'true');
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

    render(<ClubHeader club={baseClub} onEditPhoto={noop} onDeleteClub={noop} />);

    expect(await screen.findByTestId('club-admin-names')).toHaveTextContent(
      'Admins: Jane Doe, John Smith'
    );
    expect(screen.getByTestId('club-secretary-names')).toHaveTextContent('Secretary: Pat Lee');
  });

  it('renders nothing when this viewer gets no officials back', async () => {
    render(<ClubHeader club={baseClub} onEditPhoto={noop} onDeleteClub={noop} />);

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

    render(<ClubHeader club={baseClub} onEditPhoto={noop} onDeleteClub={noop} />);

    expect(await screen.findByRole('alert')).toHaveTextContent("Club officials couldn't load.");
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('club-admin-names')).toHaveTextContent('Admin: Jane Doe');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not ask for officials on behalf of a signed-out guest', () => {
    (useAuthContext as Mock).mockImplementation(() => ({ user: null }));

    render(<ClubHeader club={baseClub} onEditPhoto={noop} onDeleteClub={noop} />);

    expect(getClubOfficials).not.toHaveBeenCalled();
    expect(screen.queryByTestId('club-admin-names')).not.toBeInTheDocument();
  });
});
