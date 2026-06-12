/**
 * Club Payments Page — Club Admin
 *
 * Where a club treasurer connects the club's Stripe Express account and
 * (Phase 5) reviews per-show payout history. Auto-detects the admin's club
 * from auth context scopes, same as ClubMembersPage.
 */

import React, { useMemo } from 'react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ScopeType, UserRole } from '@/types/auth-types';
import { ClubPaymentsCard } from '@/features/payments/ClubPaymentsCard';

const ClubPaymentsPage: React.FC = () => {
  const { userWithRoles } = useAuthContext();

  // Detect club from auth scopes
  const clubId = useMemo(
    () =>
      userWithRoles?.scopes?.find(
        s => s.scopeType === ScopeType.CLUB && s.roleId === UserRole.CLUB_ADMIN
      )?.scopeId,
    [userWithRoles?.scopes]
  );

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
          <CardContent className="py-8 text-center text-muted-foreground">
            No club is associated with your account. Payments are managed by a club admin.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClubPaymentsPage;
