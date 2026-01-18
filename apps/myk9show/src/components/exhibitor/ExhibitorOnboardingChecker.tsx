/**
 * Component that checks if the current user needs to complete onboarding
 * Wraps children and shows modal if profile is missing
 */

import React, { useState } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { ExhibitorOnboardingModal } from './ExhibitorOnboardingModal';

interface ExhibitorOnboardingCheckerProps {
  children: React.ReactNode;
}

export function ExhibitorOnboardingChecker({ children }: ExhibitorOnboardingCheckerProps) {
  const { user, loading: authLoading } = useAuthContext();
  const { needsOnboarding, isLoading: profileLoading, refetch } = useExhibitorProfile();
  const [skipped, setSkipped] = useState(false);

  // Don't show modal while auth or profile is loading
  const isLoading = authLoading || profileLoading;

  // Only show modal if user is logged in, needs onboarding, and hasn't skipped
  const showModal = !isLoading && user && needsOnboarding && !skipped;

  const handleComplete = () => {
    // Refetch profile to update state
    refetch();
  };

  const handleSkip = () => {
    // Allow user to skip for this session (modal will show again on next visit)
    setSkipped(true);
  };

  return (
    <>
      {children}
      <ExhibitorOnboardingModal
        open={showModal || false}
        onComplete={handleComplete}
        onSkip={handleSkip}
      />
    </>
  );
}
