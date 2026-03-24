/**
 * Stats cards component for MyEntriesPage
 * Displays summary statistics using shared StatCard components
 * @module MyEntriesPage/components
 */

import React from 'react';
import { StatCard, StatsGrid } from '@myk9/ui';
import { Users, CheckCircle2, AlertCircle, DollarSign } from 'lucide-react';
import type { MyEntryStats } from './my-entries-types';

interface MyEntriesStatsCardsProps {
  stats: MyEntryStats;
}

/**
 * Stats cards showing entry summary with progress bars
 */
export const MyEntriesStatsCards: React.FC<MyEntriesStatsCardsProps> = ({ stats }) => {
  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={Users}
        title="Total Entries"
        value={stats.total}
        color="primary"
        subtitle={`Active: ${stats.accepted} · ${stats.upcoming} upcoming`}
        progress={stats.acceptedPercent}
      />
      <StatCard
        icon={CheckCircle2}
        title="Accepted"
        value={stats.accepted}
        color="emerald"
        subtitle={`Ready to compete · ${stats.acceptedPaid} paid`}
        progress={stats.acceptedPercent}
      />
      <StatCard
        icon={AlertCircle}
        title="Needs Action"
        value={stats.needsAction}
        color="red"
        subtitle={`${stats.pending} awaiting review · ${stats.acceptedUnpaid} payment due`}
        progress={stats.needsActionPercent}
      />
      <StatCard
        icon={DollarSign}
        title="Total Fees"
        value={`$${stats.totalFees}`}
        color="blue"
        subtitle={`$${stats.paidFees} paid · $${stats.unpaidFees} pending`}
        progress={stats.paidPercent}
      />
    </StatsGrid>
  );
};
