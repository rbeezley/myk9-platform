import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import RoleRequestsPage from '../RoleRequestsPage';

const getAllRoleRequests = vi.fn();
const approveRoleRequest = vi.fn();
const denyRoleRequest = vi.fn();

vi.mock('@/services/database/role-requests', () => ({
  getAllRoleRequests: () => getAllRoleRequests(),
  approveRoleRequest: (requestId: string, input: unknown) => approveRoleRequest(requestId, input),
  denyRoleRequest: (requestId: string, reviewerNote: string) =>
    denyRoleRequest(requestId, reviewerNote),
}));

vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useClubsQuery: () => ({
    data: [{ id: 'club-1', name: 'Best Club' }],
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('RoleRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllRoleRequests.mockResolvedValue([
      {
        id: 'request-1',
        authUserId: 'auth-1',
        personId: 'person-1',
        requestedRole: 'club_admin',
        requestedScope: 'club',
        clubId: null,
        clubName: null,
        showId: null,
        status: 'pending',
        requesterNote: 'Created from signup role intent.',
        reviewerNote: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: '2026-05-24T12:00:00Z',
        updatedAt: '2026-05-24T12:00:00Z',
        requesterName: 'Pat Morgan',
        requesterEmail: 'pat@example.com',
      },
    ]);
  });

  it('lets a site admin approve a pending role request after choosing a club', async () => {
    const user = userEvent.setup();

    render(<RoleRequestsPage />, { initialRoute: '/admin/role-requests' });

    expect(await screen.findByText('Pat Morgan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/club/i), 'club-1');
    await user.type(screen.getByLabelText(/admin note/i), 'Verified with club.');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(approveRoleRequest).toHaveBeenCalledWith('request-1', {
        clubId: 'club-1',
        reviewerNote: 'Verified with club.',
      });
    });
  });

  it('lets a site admin deny a pending role request with a note', async () => {
    const user = userEvent.setup();

    render(<RoleRequestsPage />, { initialRoute: '/admin/role-requests' });

    expect(await screen.findByText('Pat Morgan')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/admin note/i), 'Need club confirmation.');
    await user.click(screen.getByRole('button', { name: /deny/i }));

    await waitFor(() => {
      expect(denyRoleRequest).toHaveBeenCalledWith('request-1', 'Need club confirmation.');
    });
  });

  it('shows the granted club name so the admin can tell which club the request maps to', async () => {
    getAllRoleRequests.mockResolvedValueOnce([
      {
        id: 'request-2',
        authUserId: 'auth-2',
        personId: 'person-2',
        requestedRole: 'secretary',
        requestedScope: 'club',
        clubId: 'club-1',
        clubName: 'Best Club',
        showId: null,
        status: 'approved',
        requesterNote: null,
        reviewerNote: 'Confirmed by phone.',
        reviewedBy: 'admin-1',
        reviewedAt: '2026-05-25T12:00:00Z',
        createdAt: '2026-05-24T12:00:00Z',
        updatedAt: '2026-05-25T12:00:00Z',
        requesterName: 'Jordan Lee',
        requesterEmail: 'jordan@example.com',
      },
    ]);

    render(<RoleRequestsPage />, { initialRoute: '/admin/role-requests' });

    // Approved requests live behind the "Approved" filter.
    await screen.findByRole('button', { name: /Approved \(1\)/ });
    await userEvent.setup().click(screen.getByRole('button', { name: /Approved \(1\)/ }));

    expect(await screen.findByText(/Best Club/)).toBeInTheDocument();
  });

  it('marks the active status filter with aria-pressed for assistive tech', async () => {
    render(<RoleRequestsPage />, { initialRoute: '/admin/role-requests' });

    const pendingFilter = await screen.findByRole('button', { name: /Pending \(1\)/ });
    expect(pendingFilter).toHaveAttribute('aria-pressed', 'true');

    const allFilter = screen.getByRole('button', { name: /All \(1\)/ });
    expect(allFilter).toHaveAttribute('aria-pressed', 'false');
  });
});
