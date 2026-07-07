/**
 * Exhibitor Onboarding Wizard — full-page setup.
 * Route: /onboarding (rendered outside UnifiedAppLayout — no sidebar).
 *
 * Step 1 – Profile        (required, creates exhibitor_profiles row)
 * Step 2 – Add Your Dogs  (skippable)
 * Step 3 – Welcome        (sets onboarding_completed_at, navigates to /shows)
 */

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile, CreateExhibitorProfileData } from '@/hooks/useExhibitorProfile';
import { getDashboardRoute } from '@/hooks/roleUtils';
import { UserRole } from '@/types/auth-types';
import { StepProfile, ProfileData } from './steps/StepProfile';
import { StepDogs } from './steps/StepDogs';
import { StepWelcome } from './steps/StepWelcome';

const PROFILE_STEP = 1;
const DOGS_STEP = 2;
const WELCOME_STEP = 3;

const STEP_LABELS: Record<number, string> = {
  [PROFILE_STEP]: 'Profile',
  [DOGS_STEP]: 'Dogs',
  [WELCOME_STEP]: 'Welcome',
};
const STAFF_ROLES = new Set<UserRole>([
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.JUDGE,
  UserRole.CLUB_ADMIN,
]);

function StepIndicator({
  current,
  visibleSteps,
}: {
  current: number;
  visibleSteps: readonly number[];
}) {
  const total = visibleSteps.length;
  const currentIndex = Math.max(0, visibleSteps.indexOf(current));
  const displayCurrent = currentIndex + 1;
  const pct = total > 1 ? Math.round((currentIndex / (total - 1)) * 100) : 100;

  return (
    <div className="space-y-1" aria-label={`Step ${displayCurrent} of ${total}`}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{STEP_LABELS[current]}</span>
        <span>
          {displayCurrent} of {total}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

export default function ExhibitorOnboardingPage() {
  const navigate = useNavigate();
  const { user, userWithRoles, loading: authLoading, rbacLoading } = useAuthContext();
  const roles = useMemo(() => userWithRoles?.roles ?? [], [userWithRoles?.roles]);
  const isStaffUser = roles.some(role => STAFF_ROLES.has(role));

  useEffect(() => {
    if (authLoading || user) return;
    navigate('/sign-in?returnTo=/onboarding', { replace: true });
  }, [authLoading, navigate, user]);

  useEffect(() => {
    if (authLoading || rbacLoading || !user || !isStaffUser) return;
    navigate(getDashboardRoute(roles), { replace: true });
  }, [authLoading, isStaffUser, navigate, rbacLoading, roles, user]);

  if (!user || ((authLoading || rbacLoading) && user)) {
    return (
      <div
        role="status"
        aria-label="Loading exhibitor onboarding"
        className="flex min-h-screen items-center justify-center bg-background p-4"
      >
        <div className="w-full max-w-2xl space-y-6">
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="mb-3 h-7 w-56" />
            <Skeleton className="mb-6 h-4 w-80 max-w-full" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isStaffUser) {
    return null;
  }

  return <ExhibitorOnboardingWizard user={user} />;
}

function ExhibitorOnboardingWizard({ user }: { user: User }) {
  const navigate = useNavigate();
  const {
    profile: exhibitorProfile,
    isLoading: profileLoading,
    createProfileAsync,
    isCreatingProfile,
    completeOnboarding,
    isCompletingOnboarding,
  } = useExhibitorProfile();
  const userMeta = user.user_metadata ?? {};

  const firstAvailableStep = exhibitorProfile ? DOGS_STEP : PROFILE_STEP;
  const visibleSteps = useMemo<number[]>(
    () =>
      exhibitorProfile
        ? [DOGS_STEP, WELCOME_STEP]
        : [PROFILE_STEP, DOGS_STEP, WELCOME_STEP],
    [exhibitorProfile]
  );

  // Wizard state
  const [step, setStep] = useState(firstAvailableStep);
  const [stepError, setStepError] = useState('');

  // Step data
  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: (userMeta.first_name ?? userMeta.firstName ?? '') as string,
    lastName: (userMeta.last_name ?? userMeta.lastName ?? '') as string,
    phone: (userMeta.phone ?? '') as string,
  });
  const visibleStep = visibleSteps.includes(step) ? step : firstAvailableStep;

  useEffect(() => {
    if (profileLoading || !exhibitorProfile?.onboarding_completed_at) return;
    navigate('/shows', { replace: true });
  }, [exhibitorProfile?.onboarding_completed_at, navigate, profileLoading]);

  if (profileLoading) {
    return (
      <div
        role="status"
        aria-label="Loading exhibitor profile"
        className="min-h-screen bg-background flex flex-col items-center justify-start py-10 px-4"
      >
        <div className="w-full max-w-lg space-y-6">
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="mb-3 h-7 w-56" />
            <Skeleton className="mb-6 h-4 w-80 max-w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (exhibitorProfile?.onboarding_completed_at) {
    return null;
  }

  // ── Step 1: create profile ──────────────────────────────────────────────────
  const handleProfileNext = async () => {
    setStepError('');
    if (exhibitorProfile) {
      setStep(DOGS_STEP);
      return;
    }

    if (!profileData.firstName.trim() || !profileData.lastName.trim()) {
      setStepError('First name and last name are required.');
      return;
    }
    try {
      const trimmedPhone = profileData.phone.trim();
      const payload: CreateExhibitorProfileData = {
        firstName: profileData.firstName.trim(),
        lastName: profileData.lastName.trim(),
        email: user?.email ?? '',
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
      };
      await createProfileAsync(payload);
      setStep(DOGS_STEP);
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Failed to create profile. Please retry.');
    }
  };

  // ── Step 2: dogs are saved directly via AddDogPanel — just advance ───────────
  const handleDogsNext = () => {
    setStepError('');
    setStep(WELCOME_STEP);
  };

  const handleDogsSkip = () => {
    setStepError('');
    setStep(WELCOME_STEP);
  };

  // ── Step 3: complete onboarding ───────────────────────────────────────────────
  const handleFinish = async () => {
    setStepError('');
    try {
      await completeOnboarding();
      navigate('/shows', { replace: true });
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const goBack = () => {
    setStepError('');
    setStep(s => Math.max(firstAvailableStep, s - 1));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to myK9Show</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Let's get you set up in just a few steps.
          </p>
        </div>

        {/* Progress */}
        <StepIndicator current={visibleStep} visibleSteps={visibleSteps} />

        {/* Step content */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {visibleStep === 1 && (
            <StepProfile
              data={profileData}
              email={user?.email ?? ''}
              onChange={setProfileData}
              onNext={handleProfileNext}
              isSubmitting={isCreatingProfile}
              error={stepError}
            />
          )}
          {visibleStep === 2 && (
            <StepDogs
              personId={exhibitorProfile?.person_id ?? user?.id ?? ''}
              onNext={handleDogsNext}
              onBack={goBack}
              onSkip={handleDogsSkip}
              canGoBack={visibleStep > firstAvailableStep}
            />
          )}
          {visibleStep === WELCOME_STEP && (
            <StepWelcome
              onFinish={handleFinish}
              onBack={goBack}
              isSubmitting={isCompletingOnboarding}
              error={stepError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
