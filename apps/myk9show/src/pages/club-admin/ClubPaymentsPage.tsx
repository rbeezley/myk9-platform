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
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentValidatedClubContext } from '@/hooks/useValidatedClubContext';
import { ClubContextGate } from '@/components/club-admin/ClubContextGate';
import { ClubSwitcher } from '@/components/club-admin/ClubSwitcher';
import { ClubPaymentsCard } from '@/features/payments/ClubPaymentsCard';
import { ClubFeeTransparencyNote } from '@/features/payments/ClubFeeTransparencyNote';

const ClubPaymentsPage: React.FC = () => {
  const clubContext = useCurrentValidatedClubContext();
  const ensureClubsReady = useClubStore(state => state.ensureClubsReady);
  const selectClub = useClubStore(state => state.selectClub);
  const { user } = useAuthContext();
  const handleSelectClub = (id: string) => selectClub(id, user?.id ?? null);

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
        <>
          <ClubSwitcher
            clubs={clubContext.clubs}
            selectedClubId={clubContext.clubId}
            onSelectClub={handleSelectClub}
          />
          <ClubPaymentsCard clubId={clubContext.clubId} />
          {/* MYK9-229: the club admin's answer to "why is there a service
              fee?", with the club-keeps-100% fact first. */}
          <ClubFeeTransparencyNote />
        </>
      ) : (
        <ClubContextGate
          context={clubContext}
          surface="payments"
          onRetry={() => void ensureClubsReady({ force: true })}
          onSelectClub={handleSelectClub}
        />
      )}
    </div>
  );
};

export default ClubPaymentsPage;
