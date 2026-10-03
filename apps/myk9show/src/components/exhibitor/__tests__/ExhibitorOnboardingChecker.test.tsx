import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ExhibitorOnboardingChecker } from '../ExhibitorOnboardingChecker';
import { UserRole } from '@/types/auth-types';

// Mock hooks
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: vi.fn(),
}));

// Capture navigate calls
const mockNavigate = vi.fn();
let mockPathname = '/exhibitor/dashboard';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: mockPathname }),
  };
});

import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';

const mockUseAuthContext = useAuthContext as ReturnType<typeof vi.fn>;
const mockUseExhibitorProfile = useExhibitorProfile as ReturnType<typeof vi.fn>;

interface MockSetup {
  user?: { id: string; email: string } | null;
  roles?: UserRole[];
  authLoading?: boolean;
  rbacLoading?: boolean;
  profileLoading?: boolean;
  hasProfile?: boolean;
  onboardingCompleted?: boolean;
  onboardedRoles?: string[] | null;
  profileSettled?: boolean;
  error?: Error | null;
}

function setupMocks({
  user = { id: 'u1', email: 'a@b.com' },
  roles = [UserRole.EXHIBITOR],
  authLoading = false,
  rbacLoading = false,
  profileLoading = false,
  hasProfile = true,
  onboardingCompleted = true,
  onboardedRoles = [],
  profileSettled = true,
  error = null,
}: MockSetup = {}) {
  mockUseAuthContext.mockReturnValue({
    user,
    userWithRoles: user ? { ...user, roles, permissions: [], scopes: [] } : null,
    loading: authLoading,
    rbacLoading,
  });
  mockUseExhibitorProfile.mockReturnValue({
    profile: hasProfile
      ? {
          id: 'profile-1',
          person_id: 'person-1',
          onboarding_completed_at: onboardingCompleted ? '2026-07-07T12:00:00.000Z' : null,
          onboarded_roles: onboardedRoles,
        }
      : null,
    profileSettled,
    isLoading: profileLoading,
    error,
  });
}

const renderChecker = (text = 'Dashboard content') =>
  render(
    <ExhibitorOnboardingChecker>
      <div>{text}</div>
    </ExhibitorOnboardingChecker>
  );

describe('ExhibitorOnboardingChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/exhibitor/dashboard';
  });

  it('renders children when profile exists and onboarding is complete', () => {
    setupMocks();
    renderChecker();
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects to /onboarding when there is no profile row', () => {
    setupMocks({ hasProfile: false, onboardingCompleted: false });
    renderChecker();
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('redirects when profile exists but onboarding is not complete', () => {
    setupMocks({ onboardingCompleted: false });
    renderChecker();
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  // MYK9-970 round 4: staff are never force-redirected — their show desk at
  // /shows/:id is where they run a show (docs/INTENT.md). NewRoleStepBanner
  // offers their unfinished set-up instead.
  it.each([
    UserRole.SECRETARY,
    UserRole.JUDGE,
    UserRole.CLUB_ADMIN,
    UserRole.CHAIRMAN,
    UserRole.STEWARD,
    UserRole.SITE_ADMIN,
  ])('never redirects a %s with unfinished onboarding from the show desk', role => {
    mockPathname = '/shows/s1';
    for (const hasProfile of [true, false]) {
      setupMocks({ roles: [role, UserRole.EXHIBITOR], hasProfile, onboardingCompleted: false });
      renderChecker().unmount();
    }
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects an exhibitor-only user with unfinished onboarding from /shows/s1', () => {
    mockPathname = '/shows/s1';
    setupMocks({ roles: [UserRole.EXHIBITOR], onboardingCompleted: false });
    renderChecker();
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('does not redirect while RBAC is still loading (staff or not is unknown)', () => {
    setupMocks({ rbacLoading: true, roles: [], onboardingCompleted: false });
    renderChecker();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // A role gained after onboarding is offered by NewRoleStepBanner, never by a
  // redirect, so the guard needs no role state at all (MYK9-970 round 3).
  it('does not redirect an onboarded user who has since gained a role', () => {
    setupMocks({ roles: [UserRole.JUDGE, UserRole.EXHIBITOR], onboardedRoles: [] });
    renderChecker();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect an onboarded site admin (no site-admin role step)', () => {
    setupMocks({ roles: [UserRole.SITE_ADMIN] });
    renderChecker();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Every show-day route family, for an exhibitor-only user with unfinished
  // onboarding (the only kind the guard redirects). The list is shared with the
  // PWA update prompt (isSensitivePath).
  it.each([
    ['ringside landing', '/at-show'],
    ['ringside class', '/at-show/show-1/class/c1'],
    ['ringside scoresheet', '/at-show/show-1/class/c1/score/e1'],
    ['TV display', '/tv/show-1'],
    ['scoring entries list', '/scoring/classes/c1/entries'],
    ['scoring scoresheet', '/scoring/classes/c1/entries/e1'],
    ['live class dashboard', '/shows/s1/trials/t1/classes/c1/secretary'],
    ['checkout', '/checkout/success'],
  ])('never redirects from the %s (%s)', (_family, pathname) => {
    mockPathname = pathname;
    setupMocks({ roles: [UserRole.EXHIBITOR], onboardingCompleted: false });
    renderChecker();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('still redirects from an ordinary page (positive control)', () => {
    mockPathname = '/shows';
    setupMocks({ roles: [UserRole.EXHIBITOR], onboardingCompleted: false });
    renderChecker();
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('does not redirect on profile fetch errors', () => {
    setupMocks({
      onboardingCompleted: false,
      profileSettled: false,
      error: new Error('Database error'),
    });
    renderChecker();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect when user is not authenticated', () => {
    setupMocks({ user: null, hasProfile: false, onboardingCompleted: false });
    renderChecker('Public content');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect while auth is loading', () => {
    setupMocks({ authLoading: true, hasProfile: false, onboardingCompleted: false });
    renderChecker('Loading state');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect while profile is loading', () => {
    setupMocks({ profileLoading: true, onboardingCompleted: false });
    renderChecker('Loading state');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // MYK9-347 regression guard. A cold boot with no coverage parks the profile
  // query at status:'pending' / fetchStatus:'paused'. That is NOT loading
  // (`isLoading` is `isPending && isFetching`, and a paused query is not
  // fetching) and NOT an error, so every other guard in the effect is open and
  // the profile reads as missing purely because it is undefined.
  // A fully onboarded exhibitor standing at a venue must NOT be sent to an
  // onboarding flow they cannot complete offline.
  it('does not redirect while the profile query is paused offline (unsettled)', () => {
    setupMocks({ hasProfile: false, onboardingCompleted: false, profileSettled: false });
    renderChecker('My Entries');
    expect(screen.getByText('My Entries')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
