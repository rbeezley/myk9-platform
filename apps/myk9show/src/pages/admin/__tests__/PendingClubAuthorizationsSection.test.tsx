import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { PendingClubAuthorizationsSection } from '../PendingClubAuthorizationsSection';
import { getPendingClubAuthorizations, setClubAuthorization } from '@/services/database/clubs';

vi.mock('@/services/database/clubs', () => ({
  getPendingClubAuthorizations: vi.fn(),
  PENDING_CLUB_AUTHORIZATIONS_QUERY_KEY: ['admin', 'pending-club-authorizations'],
  setClubAuthorization: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn() },
}));

const club = {
  id: 'club-darboshea',
  name: 'Darboshea Tervuren Club',
  website: null,
  city: 'Tulsa',
  state: 'OK',
  createdAt: '2026-09-01T00:00:00Z',
};

describe('PendingClubAuthorizationsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPendingClubAuthorizations).mockResolvedValue([club]);
    vi.mocked(setClubAuthorization).mockResolvedValue();
  });

  it('shows an unauthorized club after a fresh mount, without requiring an access request', async () => {
    const first = render(<PendingClubAuthorizationsSection />);

    expect(
      await screen.findByRole('button', { name: 'Authorize Darboshea Tervuren Club' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Club access and publication are separate approvals/i)
    ).toBeInTheDocument();
    first.unmount();

    render(<PendingClubAuthorizationsSection />);
    expect(
      await screen.findByRole('button', { name: 'Authorize Darboshea Tervuren Club' })
    ).toBeInTheDocument();
    expect(getPendingClubAuthorizations).toHaveBeenCalledTimes(2);
  });

  it('requires a named confirmation and respects cancel', async () => {
    const { user } = render(<PendingClubAuthorizationsSection />);
    await user.click(
      await screen.findByRole('button', { name: 'Authorize Darboshea Tervuren Club' })
    );

    expect(
      screen.getByRole('heading', { name: 'Authorize Darboshea Tervuren Club?' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/list the club publicly and let its organizers publish shows/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(setClubAuthorization).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Authorize Darboshea Tervuren Club' })
    ).toBeInTheDocument();
  });

  it('authorizes the exact club through the RPC and removes it after refresh', async () => {
    vi.mocked(getPendingClubAuthorizations).mockResolvedValueOnce([club]).mockResolvedValueOnce([]);
    const { user } = render(<PendingClubAuthorizationsSection />);
    await user.click(
      await screen.findByRole('button', { name: 'Authorize Darboshea Tervuren Club' })
    );
    await user.click(screen.getByRole('button', { name: 'Authorize club' }));

    await waitFor(() => expect(setClubAuthorization).toHaveBeenCalledWith('club-darboshea', true));
    expect(await screen.findByText('No clubs are waiting for authorization.')).toBeInTheDocument();
  });

  it('keeps the club and retry action visible after a write failure', async () => {
    vi.mocked(setClubAuthorization).mockRejectedValueOnce(new Error('network'));
    const { user } = render(<PendingClubAuthorizationsSection />);
    await user.click(
      await screen.findByRole('button', { name: 'Authorize Darboshea Tervuren Club' })
    );
    await user.click(screen.getByRole('button', { name: 'Authorize club' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't authorize this club.");
    expect(screen.getByRole('button', { name: 'Authorize club' })).toBeEnabled();
    expect(getPendingClubAuthorizations).toHaveBeenCalledTimes(1);
  });

  it('shows a read failure with a retry instead of an all-clear', async () => {
    vi.mocked(getPendingClubAuthorizations)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([club]);
    const { user } = render(<PendingClubAuthorizationsSection />);

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't check which clubs");
    expect(screen.queryByText('No clubs are waiting for authorization.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Authorize Darboshea Tervuren Club' })
    ).toBeInTheDocument();
  });
});
