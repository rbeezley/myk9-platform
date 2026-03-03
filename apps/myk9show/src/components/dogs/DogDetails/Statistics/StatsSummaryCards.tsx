import React from 'react';
import { BarChart3, Award, Clock, TrendingUp } from 'lucide-react';
import type { PerformanceSummary, StatusBreakdown } from '@/services/performanceStatsEngine';

interface StatsSummaryCardsProps {
  summary: PerformanceSummary;
  overall: StatusBreakdown;
}

interface CardData {
  label: string;
  value: string;
  subtitle?: string | undefined;
  icon: React.ReactNode;
  gradient: string;
}

const StatsSummaryCards: React.FC<StatsSummaryCardsProps> = ({ summary, overall }) => {
  const cards: CardData[] = [
    {
      label: 'Total Entries',
      value: String(summary.totalCompetitions),
      icon: <BarChart3 className="h-5 w-5" />,
      gradient: 'from-blue-500/15 to-blue-500/5 text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Q Rate',
      value: `${overall.qRate}%`,
      subtitle: `${overall.qualified} of ${overall.total}`,
      icon: <Award className="h-5 w-5" />,
      gradient: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Fastest Time',
      value: summary.fastestTime ? `${summary.fastestTime.seconds.toFixed(2)}s` : '—',
      subtitle: summary.fastestTime?.className || undefined,
      icon: <Clock className="h-5 w-5" />,
      gradient: 'from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400',
    },
    {
      label: 'Avg Time',
      value: summary.avgTime ? `${summary.avgTime.toFixed(2)}s` : '—',
      subtitle: 'Qualified runs',
      icon: <TrendingUp className="h-5 w-5" />,
      gradient: 'from-purple-500/15 to-purple-500/5 text-purple-600 dark:text-purple-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <div
          key={card.label}
          className={`flex flex-col items-center text-center p-4 rounded-xl border bg-gradient-to-br ${card.gradient}`}
        >
          <div className="mb-2">{card.icon}</div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {card.label}
          </span>
          <span className="text-2xl font-bold">{card.value}</span>
          {card.subtitle && (
            <span className="text-xs text-muted-foreground mt-0.5 truncate max-w-full">
              {card.subtitle}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default StatsSummaryCards;
