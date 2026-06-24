/**
 * RingsideEntryPage — the bare `/at-show` route. Gives the permanent "Ringside"
 * sidebar item a sane destination for every user (see
 * docs/plan-ringside-navigation.md):
 *
 *  - Not signed in → the shared SmartSignInPage (passcode / QR front door).
 *  - Signed in, exactly one live show → auto-jump into `/at-show/:showId`.
 *  - Signed in, several or no live shows → RingsideHome (chooser / empty state).
 *  - "Enter a passcode" from the home → SmartSignInPage, for at-venue staff whose
 *    show isn't tied to their account.
 *
 * Chromeless/full-screen like the rest of the ringside surface.
 */

import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { LoadingEmptyState } from '@/components/common/EmptyState';
import SmartSignInPage from '@/pages/SmartSignInPage';
import { RingsideHome } from './RingsideHome';
import { useRingsideEntryShows } from './useRingsideEntryShows';

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}

const RingsideEntryPage: React.FC = () => {
  const { user, loading: authLoading } = useAuthContext();
  const entry = useRingsideEntryShows();
  const [showPasscode, setShowPasscode] = useState(false);

  // Explicit passcode path, or an anonymous visitor → the shared front door.
  if (showPasscode) return <SmartSignInPage />;
  if (authLoading) {
    return (
      <FullScreen>
        <LoadingEmptyState message="Loading ringside…" />
      </FullScreen>
    );
  }
  if (!user) return <SmartSignInPage />;

  if (entry.isLoading) {
    return (
      <FullScreen>
        <LoadingEmptyState message="Finding your show…" />
      </FullScreen>
    );
  }

  // Exactly one live show on show day → straight into the ring, no extra tap.
  if (entry.liveShows.length === 1) {
    return <Navigate to={`/at-show/${entry.liveShows[0].showId}`} replace />;
  }

  return (
    <RingsideHome
      liveShows={entry.liveShows}
      upcomingShows={entry.upcomingShows}
      onEnterPasscode={() => setShowPasscode(true)}
    />
  );
};

export default RingsideEntryPage;
