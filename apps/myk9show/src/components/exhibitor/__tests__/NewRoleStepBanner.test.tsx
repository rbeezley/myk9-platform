import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { fromPartial } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { NewRoleStepBanner } from '../NewRoleStepBanner';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('@/hooks/useExhibitorProfile', () => ({ useExhibitorProfile: vi.fn() }));

const mockAuth = vi.mocked(useAuthContext);
const mockProfile = vi.mocked(useExhibitorProfile);
const completeOnboarding = vi.fn();

function setup({
  userId = 'u1',
  roles,
  onboardedRoles = [],
  completed = true,
}: {
  userId?: string | null;
  roles: UserRole[];
  onboardedRoles?: string[];
  completed?: boolean;
}) {
  mockAuth.mockReturnValue(
    fromPartial({
      user: userId ? { id: userId, is_anonymous: false } : null,
      userWithRoles: userId ? { id: userId, roles, permissions: [], scopes: [] } : null,
      rbacLoading: false,
    })
  );
  mockProfile.mockReturnValue(
    fromPartial({
      profile: userId
        ? {
            id: `profile-${userId}`,
            onboarding_completed_at: completed ? '2026-07-07T12:00:00.000Z' : null,
            onboarded_roles: onboardedRoles,
          }
        : null,
      completeOnboarding,
      isCompletingOnboarding: false,
    })
  );
}

const banner = () => screen.queryByRole('status');

beforeEach(() => {
  navigateMock.mockClear();
  completeOnboarding.mockReset().mockResolvedValue('2026-10-03T12:00:00.000Z');
});

describe('NewRoleStepBanner', () => {
  it('appears when a role is granted mid-session, and never redirects', () => {
    setup({ roles: [UserRole.EXHIBITOR] });
    const view = render(<NewRoleStepBanner />, { initialRoute: '/shows' });
    expect(banner()).not.toBeInTheDocument();

    setup({ roles: [UserRole.EXHIBITOR, UserRole.JUDGE] }); // RBAC re-poll
    view.rerender(<NewRoleStepBanner />);

    expect(banner()).toHaveTextContent("You're now a judge.");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('disappears when the role is revoked mid-session, with no redirect', () => {
    setup({ roles: [UserRole.JUDGE] });
    const view = render(<NewRoleStepBanner />, { initialRoute: '/shows' });
    expect(banner()).toBeInTheDocument();

    setup({ roles: [UserRole.EXHIBITOR] });
    view.rerender(<NewRoleStepBanner />);

    expect(banner()).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('carries no state across sign-out and a different sign-in', () => {
    setup({ roles: [UserRole.JUDGE] });
    const view = render(<NewRoleStepBanner />, { initialRoute: '/shows' });
    expect(banner()).toHaveTextContent("You're now a judge.");

    setup({ userId: null, roles: [] });
    view.rerender(<NewRoleStepBanner />);
    expect(banner()).not.toBeInTheDocument();

    setup({ userId: 'u2', roles: [UserRole.SECRETARY] });
    view.rerender(<NewRoleStepBanner />);
    expect(banner()).toHaveTextContent("You're now a show secretary.");
    expect(banner()).not.toHaveTextContent('judge');
  });

  it.each([
    '/at-show/show-1/class/c1',
    '/scoring/classes/c1/entries/e1',
    '/tv/show-1',
    '/onboarding',
  ])('never shows on %s', path => {
    setup({ roles: [UserRole.JUDGE] });
    render(<NewRoleStepBanner />, { initialRoute: path });
    expect(banner()).not.toBeInTheDocument();
  });

  it('waits for the first run: the onboarding redirect covers every role then', () => {
    setup({ roles: [UserRole.JUDGE], completed: false });
    render(<NewRoleStepBanner />, { initialRoute: '/shows' });
    expect(banner()).not.toBeInTheDocument();
  });

  it('shows one banner at a time', () => {
    setup({ roles: [UserRole.JUDGE, UserRole.SECRETARY, UserRole.CLUB_ADMIN] });
    render(<NewRoleStepBanner />, { initialRoute: '/shows' });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(banner()).toHaveTextContent("You're now a show secretary.");
  });

  it('opens just that step from its action', () => {
    setup({ roles: [UserRole.JUDGE] });
    render(<NewRoleStepBanner />, { initialRoute: '/shows' });
    fireEvent.click(screen.getByRole('button', { name: 'Add your judge numbers' }));
    expect(navigateMock).toHaveBeenCalledWith('/onboarding?step=judge');
  });

  it('dismissing records the role through the completion write, then hides', async () => {
    setup({ roles: [UserRole.JUDGE] });
    const view = render(<NewRoleStepBanner />, { initialRoute: '/shows' });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith(['judge']));

    // The completion write updates the profile cache.
    setup({ roles: [UserRole.JUDGE], onboardedRoles: ['judge'] });
    view.rerender(<NewRoleStepBanner />);
    expect(banner()).not.toBeInTheDocument();
  });

  it('is gone once the step is completed', () => {
    setup({ roles: [UserRole.JUDGE], onboardedRoles: ['judge'] });
    render(<NewRoleStepBanner />, { initialRoute: '/shows' });
    expect(banner()).not.toBeInTheDocument();
  });
});
