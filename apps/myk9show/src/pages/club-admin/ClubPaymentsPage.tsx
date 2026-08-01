/**
 * Club Payments Page — Club Admin
 *
 * Where a club treasurer connects the club's Stripe Express account and
 * (Phase 5) reviews per-show payout history. Auto-detects the admin's club
 * from auth context scopes, same as ClubMembersPage.
 */

import React from 'react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { useClubStore } from '@/store/clubStore';
import { useCurrentValidatedClubContext } from '@/hooks/useValidatedClubContext';
import { ClubContextGate } from '@/components/club-admin/ClubContextGate';
import { ClubPaymentsCard } from '@/features/payments/ClubPaymentsCard';

const ClubPaymentsPage: React.FC = () => {
  const clubContext = useCurrentValidatedClubContext();
  const ensureClubsReady = useClubStore(state => state.ensureClubsReady);
  const selectClub = useClubStore(state => state.selectClub);

  React.useEffect(() => {
    void ensureClubsReady();
  }, [ensureClubsReady]);

  return (
    <div className="container mx-auto space-y-6 py-6">
      <Breadcrumb items={[{ label: 'My Club' }, { label: 'Payments' }]} />
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-muted-foreground">
          How your club receives entry fees from shows run on myK9Show.
        </p>
      </div>

      {clubContext.status === 'ready' ? (
        <ClubPaymentsCard clubId={clubContext.clubId} />
      ) : (
        <ClubContextGate
          context={clubContext}
          surface="payments"
          onRetry={() => void ensureClubsReady({ force: true })}
          onSelectClub={selectClub}
        />
      )}
    </div>
  );
};

export default ClubPaymentsPage;
