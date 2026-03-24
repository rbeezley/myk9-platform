import React from 'react';
import { StatCard, StatsGrid } from '@myk9/ui';
import { Users, AlertCircle, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import type { EntryStats } from '@/types/entry-management-types';

interface EntryStatsCardsProps {
  stats: EntryStats;
}

/** Stats cards for entry management overview. */
export const EntryStatsCards: React.FC<EntryStatsCardsProps> = ({ stats }) => {
  return (
    <StatsGrid columns={5}>
      <StatCard
        icon={Users}
        title="Total Entries"
        value={stats.total}
        color="primary"
        subtitle="All entries"
      />
      <StatCard
        icon={AlertCircle}
        title="Pending"
        value={stats.pending}
        color="amber"
        subtitle="Need review"
      />
      <StatCard
        icon={CheckCircle2}
        title="Accepted"
        value={stats.accepted}
        color="emerald"
        subtitle="Confirmed entries"
      />
      <StatCard
        icon={Clock}
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
        subtitle="Collected fees"
      />
    </StatsGrid>
  );
};

export default EntryStatsCards;
