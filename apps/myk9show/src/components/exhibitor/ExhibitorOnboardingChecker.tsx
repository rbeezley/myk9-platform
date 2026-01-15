/**
 * Component that checks if the current user needs to complete onboarding
 * Wraps children and shows modal if profile is missing
 */

import React from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { ExhibitorOnboardingModal } from './ExhibitorOnboardingModal';

interface ExhibitorOnboardingCheckerProps {
  children: React.ReactNode;
}

export function ExhibitorOnboardingChecker({ children }: ExhibitorOnboardingCheckerProps) {
  const { user, loading: authLoading } = useAuthContext();
  const { needsOnboarding, isLoading: profileLoading, refetch } = useExhibitorProfile();

  // Don't show modal while auth or profile is loading
  const isLoading = authLoading || profileLoading;

  // Only show modal if user is logged in and needs onboarding
  const showModal = !isLoading && user && needsOnboarding;

  const handleComplete = () => {
    // Refetch profile to update state
    refetch();
  };

  return (
    <>
      {children}
      <ExhibitorOnboardingModal open={showModal || false} onComplete={handleComplete} />
    </>
  );
}
