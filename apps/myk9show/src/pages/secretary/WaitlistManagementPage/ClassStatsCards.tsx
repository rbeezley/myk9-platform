/**
 * Class Statistics Cards component for WaitlistManagementPage
 */

import React from 'react';
import { StatCard, StatsGrid, StatusIcon } from '@myk9/ui';
import { Users, ArrowUpCircle } from 'lucide-react';
import type { ClassWithWaitlistCount } from './types';

interface ClassStatsCardsProps {
  selectedClass: ClassWithWaitlistCount;
}

export const ClassStatsCards: React.FC<ClassStatsCardsProps> = ({ selectedClass }) => {
  const availableSpots = selectedClass.max_entries
    ? Math.max(0, selectedClass.max_entries - selectedClass.accepted_count)
    : null;

  const percentFull = selectedClass.max_entries
    ? Math.round((selectedClass.accepted_count / selectedClass.max_entries) * 100)
    : null;

  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={Users}
        title="Entry Limit"
        value={selectedClass.max_entries || '\u221E'}
        color="primary"
        subtitle="Maximum entries"
      />
      <StatCard
        icon={<StatusIcon family="entry" status="accepted" decorative />}
        title="Accepted"
        value={selectedClass.accepted_count}
        color="emerald"
        subtitle={percentFull !== null ? `${percentFull}% full` : 'No limit set'}
      />
      <StatCard
        icon={<StatusIcon family="entry" status="waitlist" decorative />}
        title="Waitlist"
        value={selectedClass.waitlist_count}
        color="amber"
        subtitle="Waiting for spots"
      />
      <StatCard
        icon={ArrowUpCircle}
        title="Available"
        value={availableSpots !== null ? availableSpots : '\u221E'}
        color="blue"
        subtitle="Open spots"
      />
    </StatsGrid>
  );
};
