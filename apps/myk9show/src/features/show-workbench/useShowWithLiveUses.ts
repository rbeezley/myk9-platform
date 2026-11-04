import { useMemo } from 'react';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';

/**
 * The show with its "This show uses..." switches read from the live replica (MYK9-1686). The
 * route's `show` is a cached query snapshot that lags a local save until sync, so a switch flipped
 * in Edit show (online or off) would otherwise leave About, readiness and suggestions stale.
 */
export function useShowWithLiveUses(show: Show): Show {
  const live = useShowStore(state => state.shows.find(candidate => candidate.id === show.id));
  const usesDeviceScoring = live?.usesDeviceScoring ?? show.usesDeviceScoring;
  const usesPaperPacket = live?.usesPaperPacket ?? show.usesPaperPacket;
  const usesVolunteers = live?.usesVolunteers ?? show.usesVolunteers;
  const usesLandingPage = live?.usesLandingPage ?? show.usesLandingPage;
  const publishesOwnPremium = live?.publishesOwnPremium ?? show.publishesOwnPremium;
  return useMemo(
    () => ({
      ...show,
      usesDeviceScoring,
      usesPaperPacket,
      usesVolunteers,
      usesLandingPage,
      publishesOwnPremium,
    }),
    [show, usesDeviceScoring, usesPaperPacket, usesVolunteers, usesLandingPage, publishesOwnPremium]
  );
}
