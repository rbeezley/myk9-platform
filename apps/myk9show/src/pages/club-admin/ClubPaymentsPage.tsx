/**
 * Club Payments Page — Club Admin
 *
 * Where a club treasurer connects the club's Stripe Express account and
 * (Phase 5) reviews per-show payout history. Auto-detects the admin's club
 * from auth context scopes, same as ClubMembersPage.
 */

import React from 'react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useClubStore } from '@/store/clubStore';
import { useCurrentValidatedClubContext } from '@/hooks/useValidatedClubContext';
import { ClubPaymentsCard } from '@/features/payments/ClubPaymentsCard';

const ClubPaymentsPage: React.FC = () => {
  const clubContext = useCurrentValidatedClubContext();
  const ensureClubsReady = useClubStore(state => state.ensureClubsReady);
  const clubId = clubContext.status === 'ready' ? clubContext.clubId : undefined;

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

      {clubId ? (
        <ClubPaymentsCard clubId={clubId} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center text-muted-foreground">
            <p>
              {clubContext.status === 'ambiguous'
                ? 'More than one club is linked to your account. Ask an administrator to correct the club access before managing payments.'
                : clubContext.status === 'missing'
                  ? 'Your club access needs to be configured before you can manage payments.'
                  : 'We could not verify your club access yet. Check your connection and try again.'}
            </p>
            {(clubContext.status === 'unavailable' || clubContext.status === 'loading') && (
              <Button onClick={() => void ensureClubsReady({ force: true })}>Try again</Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClubPaymentsPage;
