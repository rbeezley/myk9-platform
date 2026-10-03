/**
 * MYK9-970: one onboarding flow for everyone, with a step per role.
 * Page-level walks; the step builder itself is covered in onboardingSteps.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { fromPartial } from '@total-typescript/shoehorn';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import ExhibitorOnboardingPage from '../ExhibitorOnboardingPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('@/hooks/useExhibitorProfile', () => ({ useExhibitorProfile: vi.fn() }));

vi.mock('../steps/StepDogs', () => ({
  StepDogs: ({ onSkip }: { onSkip: () => void }) => (
    <button type="button" onClick={onSkip}>
      Skip for now
    </button>
  ),
}));

vi.mock('../steps/StepJudge', () => ({
  StepJudge: ({ onNext, nextLabel }: { onNext: () => void; nextLabel: string }) => (
    <div>
      <h2>Your judge numbers</h2>
      <button type="button" onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  ),
}));

const mockUseAuthContext = vi.mocked(useAuthContext);
const mockUseExhibitorProfile = vi.mocked(useExhibitorProfile);

function setup({
  roles,
  onboardingCompletedAt,
  onboardedRoles,
}: {
  roles: UserRole[];
  onboardingCompletedAt: string | null;
  onboardedRoles: string[];
}) {
  mockUseAuthContext.mockReturnValue(
    fromPartial({
      user: { id: 'auth-user-id', email: 'staff@myk9t.com', user_metadata: {} },
      userWithRoles: {
        id: 'auth-user-id',
        email: 'staff@myk9t.com',
        roles,
        permissions: [],
        scopes: [],
      },
      loading: false,
      rbacLoading: false,
    })
  );
  const completeOnboarding = vi.fn().mockResolvedValue('2026-10-03T12:00:00.000Z');
  mockUseExhibitorProfile.mockReturnValue(
    fromPartial({
      profile: {
        id: 'profile-id',
        person_id: 'person-id',
        auth_user_id: 'auth-user-id',
        onboarding_completed_at: onboardingCompletedAt,
        onboarded_roles: onboardedRoles,
      },
      isLoading: false,
      error: null,
      createProfileAsync: vi.fn(),
      isCreatingProfile: false,
      completeOnboarding,
      isCompletingOnboarding: false,
    })
  );
  return { completeOnboarding };
}

beforeEach(() => {
  navigateMock.mockClear();
});

describe('role-aware onboarding', () => {
  it('walks a secretary-judge through dogs, both role steps and welcome, then to their dashboard', async () => {
    const { completeOnboarding } = setup({
      roles: [UserRole.JUDGE, UserRole.SECRETARY, UserRole.EXHIBITOR],
      onboardingCompletedAt: null,
      onboardedRoles: [],
    });

    render(<ExhibitorOnboardingPage />);

    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(screen.getByRole('heading', { name: 'Your secretary access' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Your judge numbers' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to my dashboard' }));

    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledWith(['secretary', 'judge']);
      expect(navigateMock).toHaveBeenCalledWith('/secretary/dashboard', { replace: true });
    });
  });

  it('reruns only the new role step for a role gained after onboarding, and records it', async () => {
    const { completeOnboarding } = setup({
      roles: [UserRole.SECRETARY, UserRole.JUDGE, UserRole.EXHIBITOR],
      onboardingCompletedAt: '2026-07-07T12:00:00.000Z',
      onboardedRoles: ['judge'],
    });

    render(<ExhibitorOnboardingPage />);

    expect(screen.getByRole('heading', { name: 'One quick step' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your secretary access' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /skip for now/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Your judge numbers')).not.toBeInTheDocument();
    expect(screen.queryByText(/of 1/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledWith(['secretary', 'judge']);
      expect(navigateMock).toHaveBeenCalledWith('/secretary/dashboard', { replace: true });
    });
  });

  it('sends an already-onboarded site admin straight to their dashboard', async () => {
    setup({
      roles: [UserRole.SITE_ADMIN],
      onboardingCompletedAt: '2026-07-07T12:00:00.000Z',
      onboardedRoles: [],
    });

    render(<ExhibitorOnboardingPage />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/admin/dashboard', { replace: true });
    });
  });
});
