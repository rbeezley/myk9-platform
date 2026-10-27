import React from 'react';
import { ClubPaymentsCard } from '@/features/payments/ClubPaymentsCard';
import { ClubFeeTransparencyNote } from '@/features/payments/ClubFeeTransparencyNote';

/**
 * Payments tab (MYK9-1293): how this club receives entry fees. Shown only to an admin of the club;
 * it replaces the standalone /club-admin/payments page.
 */
export const ClubPaymentsTab: React.FC<{ clubId: string }> = ({ clubId }) => (
  <div className="space-y-6">
    <p className="text-muted-foreground">
      How your club receives entry fees from shows run on myK9Show.
    </p>
    <ClubPaymentsCard clubId={clubId} />
    {/* MYK9-229: the club admin's answer to "why is there a service fee?", with the
        club-keeps-100% fact first. */}
    <ClubFeeTransparencyNote />
  </div>
);
