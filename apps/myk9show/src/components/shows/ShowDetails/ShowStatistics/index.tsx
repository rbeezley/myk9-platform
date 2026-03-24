import React from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { StatCard, StatsGrid, type StatColor } from '@myk9/ui';
import type { LucideIcon } from 'lucide-react';
import {
  Trophy,
  Users,
  Gavel,
  Medal,
  DollarSign,
  Award,
  ListChecks,
  ClipboardList,
  BarChart3,
} from 'lucide-react';

export interface Stat {
  title: string;
  iconClass: string;
  iconBg: string;
  iconColor: string;
  value: string;
  trend: string;
  trendIcon: string;
  trendColor: string;
  detail1: string;
  detail2: string;
  progress: string;
  progressColor: string;
}

interface ShowStatisticsProps {
  stats: Stat[];
}

/**
 * Map a Font Awesome icon class to a Lucide icon component.
 * TODO: Remove once upstream Stat data source provides LucideIcon directly.
 */
function mapFaIconToLucide(iconClass: string): LucideIcon {
  const lc = iconClass.toLowerCase();
  if (lc.includes('trophy')) return Trophy;
  if (lc.includes('users') || lc.includes('user-friends')) return Users;
  if (lc.includes('gavel')) return Gavel;
  if (lc.includes('medal')) return Medal;
  if (lc.includes('dollar') || lc.includes('money')) return DollarSign;
  if (lc.includes('award') || lc.includes('certificate')) return Award;
  if (lc.includes('list') || lc.includes('clipboard-list')) return ListChecks;
  if (lc.includes('clipboard')) return ClipboardList;
  if (lc.includes('chart') || lc.includes('poll')) return BarChart3;
  // Fallback
  return BarChart3;
}

/**
 * Map a stat's color classes to a StatColor token.
 * Uses the icon background / progress color as a heuristic.
 * TODO: Remove once upstream Stat data source provides StatColor directly.
 */
function mapStatColor(stat: Stat): StatColor {
  const combined = `${stat.iconBg} ${stat.iconColor} ${stat.progressColor}`.toLowerCase();
  if (combined.includes('blue') || combined.includes('indigo')) return 'blue';
  if (combined.includes('purple') || combined.includes('violet')) return 'purple';
  if (combined.includes('green') || combined.includes('emerald') || combined.includes('teal'))
    return 'emerald';
  if (combined.includes('amber') || combined.includes('yellow') || combined.includes('orange'))
    return 'amber';
  if (combined.includes('red') || combined.includes('rose')) return 'red';
  return 'primary';
}

/**
 * ShowStatistics component to display statistics for a show
 * Should be used inside EntityCardContainer within EntityPageLayout
 */
const REVENUE_KEYWORDS = [
  'revenue',
  'income',
  'earnings',
  'financial',
  'payment',
  'fee',
  'cost',
  'profit',
];

const ShowStatistics: React.FC<ShowStatisticsProps> = ({ stats }) => {
  const { hasPermission } = useAuthContext();
  const canViewRevenue = hasPermission('manage_shows');

  const filteredStats = canViewRevenue
    ? stats
    : stats.filter(stat => !REVENUE_KEYWORDS.some(kw => stat.title.toLowerCase().includes(kw)));

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Show Statistics</h2>
      <StatsGrid columns={4}>
        {filteredStats.map((stat, i) => {
          const subtitle = [stat.detail1, stat.detail2].filter(Boolean).join(' | ');
          const progress = stat.progress ? parseInt(stat.progress, 10) : undefined;

          return (
            <StatCard
              key={i}
              icon={mapFaIconToLucide(stat.iconClass)}
              title={stat.title}
              value={stat.value}
              color={mapStatColor(stat)}
              {...(subtitle ? { subtitle } : {})}
              {...(progress != null ? { progress } : {})}
              {...(stat.trend ? { trend: stat.trend } : {})}
            />
          );
        })}
      </StatsGrid>
    </div>
  );
};

export default ShowStatistics;
