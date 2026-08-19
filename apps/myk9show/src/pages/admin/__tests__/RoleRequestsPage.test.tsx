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
        reviewerName: 'Alex Rivera',
        reviewerEmail: 'alex@example.com',
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

  it('filters requests by requester, club, or requested role', async () => {
    getAllRoleRequests.mockResolvedValueOnce([
      {
        id: 'request-1',
        authUserId: 'auth-1',
        personId: 'person-1',
        requestedRole: 'club_admin',
        requestedScope: 'club',
        clubId: null,
        clubName: 'Best Club',
        showId: null,
        status: 'pending',
        requesterNote: null,
        reviewerNote: null,
        reviewedBy: null,
        reviewerName: null,
        reviewerEmail: null,
        reviewedAt: null,
        createdAt: '2026-05-24T12:00:00Z',
        updatedAt: '2026-05-24T12:00:00Z',
        requesterName: 'Pat Morgan',
        requesterEmail: 'pat@example.com',
      },
      {
        id: 'request-2',
        authUserId: 'auth-2',
        personId: 'person-2',
        requestedRole: 'secretary',
        requestedScope: 'club',
        clubId: null,
        clubName: 'Other Club',
        showId: null,
        status: 'pending',
        requesterNote: null,
        reviewerNote: null,
        reviewedBy: null,
        reviewerName: null,
        reviewerEmail: null,
        reviewedAt: null,
        createdAt: '2026-05-23T12:00:00Z',
        updatedAt: '2026-05-23T12:00:00Z',
        requesterName: 'Jordan Lee',
        requesterEmail: 'jordan@example.com',
      },
    ]);
    const user = userEvent.setup();

    render(<RoleRequestsPage />, { initialRoute: '/admin/role-requests' });

    expect(await screen.findByText('Pat Morgan')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search role requests' }), 'other club');

    expect(screen.queryByText('Pat Morgan')).not.toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
  });

  it('shows an inline retry when approving a request fails', async () => {
    const user = userEvent.setup();
    approveRoleRequest
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);

    render(<RoleRequestsPage />, { initialRoute: '/admin/role-requests' });

    expect(await screen.findByText('Pat Morgan')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/club/i), 'club-1');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't approve this request");
    await user.click(screen.getByRole('button', { name: 'Try approval again' }));

    await waitFor(() => expect(approveRoleRequest).toHaveBeenCalledTimes(2));
  });

  it('reveals reviewer and access details inline', async () => {
    const user = userEvent.setup();
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
        reviewerName: 'Alex Rivera',
        reviewerEmail: 'alex@example.com',
        reviewedAt: '2026-05-25T12:00:00Z',
        createdAt: '2026-05-24T12:00:00Z',
        updatedAt: '2026-05-25T12:00:00Z',
        requesterName: 'Jordan Lee',
        requesterEmail: 'jordan@example.com',
      },
    ]);

    render(<RoleRequestsPage />, { initialRoute: '/admin/role-requests' });

    await user.click(await screen.findByRole('button', { name: /Approved \(1\)/ }));
    await user.click(await screen.findByRole('button', { name: 'View details' }));

    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByText('Club-wide access')).toBeInTheDocument();
  });

  it('marks the active status filter with aria-pressed for assistive tech', async () => {
    render(<RoleRequestsPage />, { initialRoute: '/admin/role-requests' });

    const pendingFilter = await screen.findByRole('button', { name: /Pending \(1\)/ });
    expect(pendingFilter).toHaveAttribute('aria-pressed', 'true');

    const allFilter = screen.getByRole('button', { name: /All \(1\)/ });
    expect(allFilter).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers a retry when loading requests fails', async () => {
    const user = userEvent.setup();
    getAllRoleRequests
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([]);

    render(<RoleRequestsPage />, { initialRoute: '/admin/role-requests' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load role requests.');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No requests waiting for review')).toBeInTheDocument();
    expect(getAllRoleRequests).toHaveBeenCalledTimes(2);
  });
});
