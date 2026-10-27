/**
 * /club-admin/members and /club-admin/payments now live as tabs on the club page (MYK9-1293).
 * /club-admin/payments/:clubId is Stripe Connect's return target (the club rides in the path because
 * stripe-connect-onboard appends its own query). These routes stay as redirects because Stripe Connect returns to /club-admin/payments?... and
 * bookmarks, the rail and toasts still point here. The incoming query string is carried over.
 */

import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useClubStore } from '@/store/clubStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentValidatedClubContext } from '@/hooks/useValidatedClubContext';
import { ClubContextGate } from '@/components/club-admin/ClubContextGate';
import { PageTransition } from '@/components/common/PageTransition';

export const ClubAdminRedirect: React.FC = () => {
  const clubContext = useCurrentValidatedClubContext();
  const ensureClubsReady = useClubStore(state => state.ensureClubsReady);
  const selectClub = useClubStore(state => state.selectClub);
  const { user } = useAuthContext();
  const { pathname, search } = useLocation();
  const { clubId: routeClubId } = useParams<{ clubId?: string }>();
  const tab = pathname.startsWith('/club-admin/payments') ? 'payments' : 'members';

  React.useEffect(() => {
    void ensureClubsReady();
  }, [ensureClubsReady]);

  // /club-admin/payments/:clubId is where Stripe Connect returns: the club is named, so use it
  // rather than the store's selection. The club page itself gates what the viewer may do there.
  const targetClubId = routeClubId ?? (clubContext.status === 'ready' ? clubContext.clubId : null);
  if (targetClubId) {
    const params = new URLSearchParams(search);
    params.set('tab', tab);
    return <Navigate replace to={`/clubs/${targetClubId}?${params.toString()}`} />;
  }

  return (
    <PageTransition>
      <ClubContextGate
        context={clubContext}
        surface={tab}
        onRetry={() => void ensureClubsReady({ force: true })}
        onSelectClub={id => selectClub(id, user?.id ?? null)}
      />
    </PageTransition>
  );
};

export default ClubAdminRedirect;
