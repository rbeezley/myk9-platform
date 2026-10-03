/**
 * Onboarding — one flow for everyone, with a step per role (MYK9-970).
 * Route: /onboarding (rendered outside UnifiedAppLayout — no sidebar).
 *
 *   Profile   (only when no exhibitor_profiles row exists yet)
 *   Dogs      ("Do you show dogs?", skippable)
 *   Secretary / Judge / Club admin — one step per role held
 *   Welcome   (completes onboarding, leads to the main role's home page)
 *
 * A role gained after onboarding reruns ONLY that role's step, once. The step
 * list is `buildOnboardingSteps` — the same rule the onboarding guard uses.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile, CreateExhibitorProfileData } from '@/hooks/useExhibitorProfile';
import { UserRole } from '@/types/auth-types';
import { StepProfile, ProfileData } from './steps/StepProfile';
import { StepDogs } from './steps/StepDogs';
import { StepWelcome } from './steps/StepWelcome';
import { StepJudge } from './steps/StepJudge';
import { StepSecretary } from './steps/StepSecretary';
import { StepClubAdmin } from './steps/StepClubAdmin';
import {
  buildOnboardingSteps,
  getOnboardingDestination,
  pendingRoleSteps,
  STEP_LABELS,
  type OnboardingStep,
} from './onboardingSteps';

// This page renders UNDER the fixed AppHeader, which nothing here offsets — a
// plain `py-10` put "Welcome to myK9Show" behind the header bar.
//
// `--app-header-height`, NOT `--app-top-inset`: this is in-flow content inside
// the Outlet, and PWAInstallBanner already renders an in-flow spacer above that
// subtree. Adding the banner's height again double-counts it, pushing onboarding
// an extra 52/56px down for install-eligible users. Same rule, same reason, as
// the comment on `<main>` in SidebarLayout. The full inset is for FIXED and
// STICKY chrome, which the spacer cannot move.
//
// The extra 2.5rem preserves the breathing room `py-10` was there for. Shared by
// the loading skeleton and the loaded page so content cannot jump between them.
const PAGE_SHELL =
  'min-h-screen bg-background flex flex-col items-center justify-start px-4 pb-10 pt-[calc(var(--app-header-height,3rem)+2.5rem)]';

// The auth-loading skeleton centres itself instead of stacking from the top, so
// the header never clipped it — but `min-h-screen` centres against the FULL
// viewport, including the 48px sitting behind the fixed header, which pulls the
// box half the header's height too high. Padding the top by the header height
// makes the content box start below it, so it centres in the area the visitor
// can actually see. `box-sizing: border-box` (Tailwind's default) is what makes
// that work: the padding comes out of the 100vh, it does not add to it.
//
// Header height only, for the same reason as PAGE_SHELL above — the PWA banner
// is already accounted for by an in-flow spacer.
const AUTH_LOADING_SHELL =
  'flex min-h-screen items-center justify-center bg-background px-4 pb-4 pt-[calc(var(--app-header-height,3rem)+1rem)]';

function StepIndicator({
  current,
  steps,
}: {
  current: OnboardingStep;
  steps: readonly OnboardingStep[];
}) {
  const total = steps.length;
  const currentIndex = Math.max(0, steps.indexOf(current));
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

  useEffect(() => {
    if (authLoading || user) return;
    navigate('/sign-in?returnTo=/onboarding', { replace: true });
  }, [authLoading, navigate, user]);

  // Roles decide which steps exist, so wait for RBAC as well as auth.
  if (!user || authLoading || rbacLoading) {
    return (
      <div role="status" aria-label="Loading onboarding" className={AUTH_LOADING_SHELL}>
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

  return <OnboardingWizard user={user} roles={roles} />;
}

function OnboardingWizard({ user, roles }: { user: User; roles: readonly UserRole[] }) {
  const navigate = useNavigate();
  const {
    profile,
    isLoading: profileLoading,
    createProfileAsync,
    isCreatingProfile,
    completeOnboarding,
    isCompletingOnboarding,
  } = useExhibitorProfile();
  const userMeta = user.user_metadata ?? {};

  const baseCompleted = Boolean(profile?.onboarding_completed_at);
  const onboardedRoles = profile?.onboarded_roles;
  const steps = useMemo(
    () =>
      buildOnboardingSteps({
        hasProfile: Boolean(profile),
        baseCompleted,
        roles,
        onboardedRoles: profile ? (onboardedRoles ?? null) : [],
      }),
    [profile, baseCompleted, roles, onboardedRoles]
  );
  const destination = getOnboardingDestination(roles);

  const [step, setStep] = useState<OnboardingStep | null>(null);
  const [stepError, setStepError] = useState('');
  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: (userMeta.first_name ?? userMeta.firstName ?? '') as string,
    lastName: (userMeta.last_name ?? userMeta.lastName ?? '') as string,
    phone: (userMeta.phone ?? '') as string,
  });

  const firstStep = steps[0];
  const visibleStep = step && steps.includes(step) ? step : firstStep;
  const stepIndex = visibleStep ? steps.indexOf(visibleStep) : -1;
  const isLastStep = stepIndex === steps.length - 1;
  const canGoBack = stepIndex > 0;

  // MYK9-858: `finishOnboarding` below also navigates once `completeOnboarding`
  // resolves, and that resolve empties `steps` via the query cache — which would
  // otherwise re-trigger this effect and bounce a link click (e.g. to /account)
  // back to the destination. This ref distinguishes "just completed it myself,
  // already navigating" from "arrived here with nothing to do" (the case this
  // effect exists for).
  const hasNavigatedAwayRef = useRef(false);

  useEffect(() => {
    if (profileLoading || steps.length > 0) return;
    if (hasNavigatedAwayRef.current) return;
    navigate(destination, { replace: true });
  }, [destination, navigate, profileLoading, steps.length]);

  if (profileLoading) {
    return (
      <div role="status" aria-label="Loading your profile" className={PAGE_SHELL}>
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

  if (!visibleStep) {
    return null;
  }

  const goNext = () => {
    setStepError('');
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    setStepError('');
    const previous = steps[stepIndex - 1];
    if (previous) setStep(previous);
  };

  // Completing onboarding must happen BEFORE navigating — Finish, the last role
  // step, or any in-flow link — so the onboarding guard on the destination does
  // not bounce the user back to /onboarding (MYK9-858). Every role step this
  // person holds is recorded, so none of them runs again.
  const finishOnboarding = async (target: string) => {
    if (isCompletingOnboarding) return;
    setStepError('');
    try {
      await completeOnboarding(pendingRoleSteps(roles, []));
      hasNavigatedAwayRef.current = true;
      navigate(target, { replace: true });
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const advance = () => (isLastStep ? finishOnboarding(destination) : goNext());

  const handleProfileNext = async () => {
    setStepError('');
    if (!profileData.firstName.trim() || !profileData.lastName.trim()) {
      setStepError('First name and last name are required.');
      return;
    }
    try {
      const trimmedPhone = profileData.phone.trim();
      const payload: CreateExhibitorProfileData = {
        firstName: profileData.firstName.trim(),
        lastName: profileData.lastName.trim(),
        email: user.email ?? '',
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
      };
      await createProfileAsync(payload);
      setStep('dogs');
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Failed to create profile. Please retry.');
    }
  };

  const roleStepProps = {
    onNext: advance,
    onBack: goBack,
    onNavigateAway: finishOnboarding,
    canGoBack,
    nextLabel: isLastStep ? 'Finish' : 'Next',
  };
  const isRoleOnlyRerun = baseCompleted;

  return (
    <div className={PAGE_SHELL}>
      <div className="w-full max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isRoleOnlyRerun ? 'One quick step' : 'Welcome to myK9Show'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isRoleOnlyRerun
              ? 'You have a new role. Here is what it means for you.'
              : "Let's get you set up in just a few steps."}
          </p>
        </div>

        {steps.length > 1 && <StepIndicator current={visibleStep} steps={steps} />}

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {visibleStep === 'profile' && (
            <StepProfile
              data={profileData}
              email={user.email ?? ''}
              onChange={setProfileData}
              onNext={handleProfileNext}
              isSubmitting={isCreatingProfile}
              error={stepError}
            />
          )}
          {visibleStep === 'dogs' && (
            <StepDogs
              personId={profile?.person_id ?? user.id}
              onNext={goNext}
              onBack={goBack}
              onSkip={goNext}
              canGoBack={canGoBack}
            />
          )}
          {visibleStep === UserRole.SECRETARY && <StepSecretary {...roleStepProps} />}
          {visibleStep === UserRole.JUDGE && (
            <StepJudge
              personId={profile?.person_id ?? ''}
              onNext={roleStepProps.onNext}
              onBack={goBack}
              canGoBack={canGoBack}
              nextLabel={roleStepProps.nextLabel}
            />
          )}
          {visibleStep === UserRole.CLUB_ADMIN && <StepClubAdmin {...roleStepProps} />}
          {visibleStep === 'welcome' && (
            <StepWelcome
              onFinish={() => finishOnboarding(destination)}
              onNavigateAway={finishOnboarding}
              onBack={goBack}
              isSubmitting={isCompletingOnboarding}
              error={stepError}
              finishLabel={destination === '/shows' ? 'Browse Shows' : 'Go to my dashboard'}
            />
          )}
          {stepError && visibleStep !== 'profile' && visibleStep !== 'welcome' && (
            <div
              className="mt-4 rounded-md bg-destructive/10 p-2 text-sm text-destructive"
              role="alert"
            >
              {stepError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
