/**
 * Judge-day statistics cards for WaitlistManagementPage.
 *
 * The same numbers the judge-day card shows (capacity is per judge-day, not per class), so "View
 * Wait List" on a Full 3/3 card reads Entry Limit 3 / Entered 3 / Available 0 (MYK9-1004).
 */

import React from 'react';
import { StatCard, StatsGrid, StatusIcon } from '@myk9/ui';
import { Users, ArrowUpCircle } from 'lucide-react';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import { OVER_LIMIT_EXPLANATION, overLimitLabel } from '@/utils/overLimitLabel';

interface JudgeDayStatsCardsProps {
  judgeDay: JudgeDayCapacity;
}

export const JudgeDayStatsCards: React.FC<JudgeDayStatsCardsProps> = ({ judgeDay }) => {
  const percentFull =
    judgeDay.capacity > 0 ? Math.round((judgeDay.confirmedCount / judgeDay.capacity) * 100) : null;

  // Same wording as the judge-day card (MYK9-1006): a day can sit over its limit on purpose.
  const overLimit = overLimitLabel(judgeDay.confirmedCount, judgeDay.capacity);

  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={Users}
        title="Entry Limit"
        value={judgeDay.capacity}
        color="primary"
        subtitle="Maximum entries for this judge-day"
      />
      <StatCard
        icon={<StatusIcon family="entry" status="accepted" decorative />}
        // MYK9-718: every entry holding a seat, as the server's capacity gate
        // counts them (not only the ones a secretary has confirmed).
        title="Entered"
        value={judgeDay.confirmedCount}
        color="emerald"
        subtitle={percentFull !== null ? `${percentFull}% full` : 'No limit set'}
      />
      <StatCard
        icon={<StatusIcon family="entry" status="waitlist" decorative />}
        title="Waitlist"
        value={judgeDay.waitlistCount}
        color="amber"
        subtitle="Waiting for spots"
      />
      <StatCard
        icon={ArrowUpCircle}
        title="Available"
        value={overLimit ?? judgeDay.availableSpots}
        color="blue"
        subtitle={overLimit ? OVER_LIMIT_EXPLANATION : 'Open spots'}
      />
    </StatsGrid>
  );
};
