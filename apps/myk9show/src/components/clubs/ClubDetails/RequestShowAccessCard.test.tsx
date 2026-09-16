/**
 * MYK9-571 — a signed-in exhibitor whose club is on the platform but has not
 * appointed them needs an in-app way to ask. This card is that ask, and only
 * that ask: it must never claim to grant access itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ScopeType, UserRole } from '@/types/auth-types';
import type { RoleScope, UserWithRoles } from '@/types/auth-types';
import type { Club } from '@/types/club-types';
import { RequestShowAccessCard } from './RequestShowAccessCard';
import {
  submitClubSecretaryRequest,
  getMyClubSecretaryRequestStatus,
  RoleRequestStandingDenialError,
} from '@/services/database/role-requests';

vi.mock('@/services/database/role-requests', () => ({
  submitClubSecretaryRequest: vi.fn(),
  getMyClubSecretaryRequestStatus: vi.fn(),
  RoleRequestAlreadyPendingError: class RoleRequestAlreadyPendingError extends Error {},
  RoleRequestStandingDenialError: class RoleRequestStandingDenialError extends Error {},
}));

const mockAuth = vi.hoisted(() => ({
  userWithRoles: null as UserWithRoles | null,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuth,
}));

const club = { id: 'club-1', name: 'Heartland Scent Work Club' } as Club;

function withScopes(
  scopes: Array<Pick<RoleScope, 'roleId' | 'scopeType' | 'scopeId'>>,
  roles: UserRole[] = [UserRole.EXHIBITOR]
): UserWithRoles {
  return {
    id: 'auth-1',
    email: 'exhibitor@example.com',
    databaseUserId: 'person-1',
    roles,
    scopes: scopes.map(scope => ({ ...scope, userId: 'person-1', createdAt: new Date(0) })),
    permissions: [],
  } as unknown as UserWithRoles;
}

describe('RequestShowAccessCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.userWithRoles = null;
    vi.mocked(getMyClubSecretaryRequestStatus).mockResolvedValue(null);
  });

  it('renders nothing for a signed-out viewer', () => {
    render(<RequestShowAccessCard club={club} />);
    expect(screen.queryByRole('button', { name: /request show access/i })).not.toBeInTheDocument();
  });

  it('renders nothing for someone already appointed secretary at this club', () => {
    mockAuth.userWithRoles = withScopes([
      { roleId: 'secretary', scopeType: ScopeType.CLUB, scopeId: club.id },
    ]);
    render(<RequestShowAccessCard club={club} />);
    expect(screen.queryByRole('button', { name: /request show access/i })).not.toBeInTheDocument();
  });

  it('renders nothing for a club admin of this club (they can appoint directly)', () => {
    mockAuth.userWithRoles = withScopes([
      { roleId: 'club_admin', scopeType: ScopeType.CLUB, scopeId: club.id },
    ]);
    render(<RequestShowAccessCard club={club} />);
    expect(screen.queryByRole('button', { name: /request show access/i })).not.toBeInTheDocument();
  });

  it('renders nothing for a site admin (they can appoint via /admin)', () => {
    mockAuth.userWithRoles = withScopes([], [UserRole.SITE_ADMIN]);
    render(<RequestShowAccessCard club={club} />);
    expect(screen.queryByRole('button', { name: /request show access/i })).not.toBeInTheDocument();
  });

  it('renders nothing while the status check is still loading', async () => {
    mockAuth.userWithRoles = withScopes([]);
    let resolveStatus!: (value: null) => void;
    vi.mocked(getMyClubSecretaryRequestStatus).mockReturnValue(
      new Promise(resolve => {
        resolveStatus = resolve;
      })
    );

    const { container } = render(<RequestShowAccessCard club={club} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /request show access/i })).not.toBeInTheDocument();

    resolveStatus(null);
    expect(await screen.findByRole('button', { name: /request show access/i })).toBeInTheDocument();
  });

  it('shows the request button for an eligible signed-in exhibitor', async () => {
    mockAuth.userWithRoles = withScopes([]);
    render(<RequestShowAccessCard club={club} />);
    expect(await screen.findByRole('button', { name: /request show access/i })).toBeInTheDocument();
    // MYK9-571 round 2 (P2-2): pins that the AUTH uid is passed, not
    // databaseUserId (the person id) or anything else on the mock.
    expect(getMyClubSecretaryRequestStatus).toHaveBeenCalledWith('club-1', 'auth-1');
  });

  it('requires a non-empty note before sending, then submits with the exact args', async () => {
    mockAuth.userWithRoles = withScopes([]);
    vi.mocked(submitClubSecretaryRequest).mockResolvedValue('request-1');
    const user = userEvent.setup();

    render(<RequestShowAccessCard club={club} />);
    await user.click(await screen.findByRole('button', { name: /request show access/i }));

    const sendButton = screen.getByRole('button', { name: /send request/i });
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByLabelText(/why are you asking/i), 'I run entries for this club.');
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);

    await waitFor(() => {
      expect(submitClubSecretaryRequest).toHaveBeenCalledWith({
        clubId: club.id,
        note: 'I run entries for this club.',
      });
    });
  });

  it('shows "Under review" instead of the button while a request is pending', async () => {
    mockAuth.userWithRoles = withScopes([]);
    vi.mocked(getMyClubSecretaryRequestStatus).mockResolvedValue({
      status: 'pending',
      reviewerNote: null,
    });

    render(<RequestShowAccessCard club={club} />);

    expect(await screen.findByText(/under review/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request show access/i })).not.toBeInTheDocument();
  });

  it('renders nothing once approved, even if scopes have not refreshed yet', async () => {
    mockAuth.userWithRoles = withScopes([]);
    vi.mocked(getMyClubSecretaryRequestStatus).mockResolvedValue({
      status: 'approved',
      reviewerNote: null,
    });

    const { container } = render(<RequestShowAccessCard club={club} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows the reviewer note alongside the unavailable message when a request was denied', async () => {
    mockAuth.userWithRoles = withScopes([]);
    vi.mocked(getMyClubSecretaryRequestStatus).mockResolvedValue({
      status: 'denied',
      reviewerNote: 'Please appoint someone with more show experience.',
    });

    render(<RequestShowAccessCard club={club} />);

    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    expect(
      screen.getByText(/please appoint someone with more show experience/i)
    ).toBeInTheDocument();
  });

  it('shows the unavailable message with no reviewer note when the club gave none', async () => {
    mockAuth.userWithRoles = withScopes([]);
    vi.mocked(getMyClubSecretaryRequestStatus).mockResolvedValue({
      status: 'denied',
      reviewerNote: null,
    });

    const { container } = render(<RequestShowAccessCard club={club} />);

    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    expect(container.querySelector('.italic')).not.toBeInTheDocument();
  });

  it('hides the button when the status check fails, instead of failing open', async () => {
    mockAuth.userWithRoles = withScopes([]);
    vi.mocked(getMyClubSecretaryRequestStatus).mockRejectedValue(new Error('network error'));

    render(<RequestShowAccessCard club={club} />);

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /request show access/i })).not.toBeInTheDocument()
    );
    expect(
      await screen.findByText(/couldn't check show access request status/i)
    ).toBeInTheDocument();
  });

  it('renders a quiet unavailable message, not a retryable button, after a standing denial', async () => {
    mockAuth.userWithRoles = withScopes([]);
    vi.mocked(submitClubSecretaryRequest).mockRejectedValue(
      new RoleRequestStandingDenialError('A previous request was denied.')
    );
    const user = userEvent.setup();

    render(<RequestShowAccessCard club={club} />);
    await user.click(await screen.findByRole('button', { name: /request show access/i }));
    await user.type(screen.getByLabelText(/why are you asking/i), 'Please reconsider.');
    await user.click(screen.getByRole('button', { name: /send request/i }));

    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request show access/i })).not.toBeInTheDocument();
  });
});
