import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { AboutTab } from '../AboutTab';
import { ClubHeader } from '../ClubHeader';

vi.mock('@/components/ui/cover-image-upload', () => ({
  CoverImageUpload: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

describe('club contact actions', () => {
  it('omits the options menu and contact actions when contact values are absent', () => {
    render(<ClubHeader club={baseClub} onEditClub={noop} onEditPhoto={noop} onDeleteClub={noop} />);

    expect(screen.queryByRole('button', { name: 'Club options' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /call/i })).not.toBeInTheDocument();
  });

  it('renders only the usable partial contact destinations', () => {
    const club = { ...baseClub, email: ' contact@heartland.example ', phone: '   ' };

    render(
      <>
        <ClubHeader club={club} onEditClub={noop} onEditPhoto={noop} onDeleteClub={noop} />
        <AboutTab club={club} />
      </>
    );

    expect(screen.getByRole('button', { name: /email/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /call/i })).not.toBeInTheDocument();
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
        onEditClub={noop}
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
        onEditClub={noop}
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
        onEditClub={noop}
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
        onEditClub={noop}
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
        onEditClub={noop}
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

  it('shows no badge for an authorized club, regardless of viewer', () => {
    render(
      <ClubHeader
        club={baseClub}
        onEditClub={noop}
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
        onEditClub={noop}
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
        onEditClub={noop}
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
