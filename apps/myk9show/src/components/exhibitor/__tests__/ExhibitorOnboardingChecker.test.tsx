import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ExhibitorOnboardingChecker } from '../ExhibitorOnboardingChecker';
import { fromAny } from '@total-typescript/shoehorn';

// Mock hooks
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: vi.fn(),
}));

// Capture navigate calls
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/exhibitor/dashboard' }),
  };
});

import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';

const mockUseAuthContext = useAuthContext as ReturnType<typeof vi.fn>;
const mockUseExhibitorProfile = useExhibitorProfile as ReturnType<typeof vi.fn>;

function setupMocks({
  user = { id: 'u1', email: 'a@b.com' },
  authLoading = false,
  profileLoading = false,
  needsOnboarding = false,
  onboardingCompleted = true,
  profileSettled = true,
  isSecretary = false,
} = {}) {
  mockUseAuthContext.mockReturnValue({
    user,
    loading: authLoading,
    isSecretary,
    hasRole: vi.fn().mockReturnValue(false),
  });
  mockUseExhibitorProfile.mockReturnValue({
    needsOnboarding,
    onboardingCompleted,
    profileSettled,
    isLoading: profileLoading,
    error: null,
  });
}

describe('ExhibitorOnboardingChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when profile exists and onboarding is complete', () => {
    setupMocks({ needsOnboarding: false, onboardingCompleted: true });
    render(
      <ExhibitorOnboardingChecker>
        <div>Dashboard content</div>
      </ExhibitorOnboardingChecker>
    );
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects to /onboarding when needsOnboarding is true', () => {
    setupMocks({ needsOnboarding: true, onboardingCompleted: false });
    render(
      <ExhibitorOnboardingChecker>
        <div>Dashboard content</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('redirects when profile exists but onboarding is not complete', () => {
    setupMocks({ needsOnboarding: false, onboardingCompleted: false });
    render(
      <ExhibitorOnboardingChecker>
        <div>Dashboard content</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('does not redirect on profile fetch errors', () => {
    setupMocks({ needsOnboarding: false, onboardingCompleted: false });
    mockUseExhibitorProfile.mockReturnValue({
      needsOnboarding: false,
      onboardingCompleted: false,
      profileSettled: false,
      isLoading: false,
      error: new Error('Database error'),
    });
    render(
      <ExhibitorOnboardingChecker>
        <div>Dashboard content</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect when user is not authenticated', () => {
    setupMocks(fromAny({ user: null, needsOnboarding: false, onboardingCompleted: false }));
    render(
      <ExhibitorOnboardingChecker>
        <div>Public content</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect while auth is loading', () => {
    setupMocks({ authLoading: true, needsOnboarding: true, onboardingCompleted: false });
    render(
      <ExhibitorOnboardingChecker>
        <div>Loading state</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect while profile is loading', () => {
    setupMocks({ profileLoading: true, needsOnboarding: false, onboardingCompleted: false });
    render(
      <ExhibitorOnboardingChecker>
        <div>Loading state</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
  // MYK9-347 regression guard. A cold boot with no coverage parks the profile
  // query at status:'pending' / fetchStatus:'paused'. That is NOT loading
  // (`isLoading` is `isPending && isFetching`, and a paused query is not
  // fetching) and NOT an error, so every other guard in the effect is open and
  // `onboardingCompleted` is false purely because `profile` is undefined.
  // A fully onboarded exhibitor standing at a venue must NOT be sent to an
  // onboarding flow they cannot complete offline.
  it('does not redirect while the profile query is paused offline (unsettled)', () => {
    setupMocks({
      profileLoading: false,
      needsOnboarding: false,
      onboardingCompleted: false,
      profileSettled: false,
    });
    render(
      <ExhibitorOnboardingChecker>
        <div>My Entries</div>
      </ExhibitorOnboardingChecker>
    );
    expect(screen.getByText('My Entries')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
