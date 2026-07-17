import React from 'react';
import { StatCard, StatsGrid, StatusIcon } from '@myk9/ui';
import { Users, DollarSign, Receipt } from 'lucide-react';
import type { EntryStats } from '@/types/entry-management-types';

interface EntryStatsCardsProps {
  stats: EntryStats;
}

/** Stats cards for entry management overview. */
export const EntryStatsCards: React.FC<EntryStatsCardsProps> = ({ stats }) => {
  return (
    <StatsGrid columns={6}>
      <StatCard
        icon={Users}
        title="Total Entries"
        value={stats.total}
        color="primary"
        subtitle="All entries"
      />
      <StatCard
        icon={<StatusIcon family="entry" status="pending" decorative />}
        title="Pending"
        value={stats.pending}
        color="amber"
        subtitle="Need review"
      />
      <StatCard
        icon={<StatusIcon family="entry" status="accepted" decorative />}
        title="Accepted"
        value={stats.accepted}
        color="emerald"
        subtitle="Confirmed entries"
      />
      <StatCard
        icon={<StatusIcon family="entry" status="waitlist" decorative />}
        title="Waitlist"
        value={stats.waitlist}
        color="blue"
        subtitle="Waiting for spots"
      />
      <StatCard
        icon={DollarSign}
        title="Revenue"
        value={`$${stats.revenue}`}
        color="emerald"
        subtitle="Collected entry fees"
      />
      <StatCard
        icon={Receipt}
        title="Outstanding"
        value={`$${stats.outstanding}`}
        color="amber"
        subtitle="Balance owed"
      />
    </StatsGrid>
  );
};

export default EntryStatsCards;
