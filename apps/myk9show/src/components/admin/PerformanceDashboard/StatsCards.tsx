import { Activity, AlertTriangle, Gauge, Users } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import type { PerformanceData } from './types';
import type { BudgetViolation } from '@/services/performance/PerformanceBudgets';

interface StatsCardsProps {
  performanceData: PerformanceData | null;
  budgetViolations: BudgetViolation[];
}

export function StatsCards({ performanceData, budgetViolations }: StatsCardsProps) {
  return (
    <StatsGrid columns={4} className="mb-8">
      <StatCard title="Performance Score" value="Good" icon={Gauge} color="emerald" />
      <StatCard
        title="Budget Violations"
        value={budgetViolations.length}
        icon={AlertTriangle}
        color="amber"
      />
      <StatCard
        title="Session Duration"
        value={`${performanceData ? Math.round(performanceData.summary.sessionDuration / 1000 / 60) : 0}min`}
        icon={Users}
        color="purple"
      />
      <StatCard title="Monitoring Status" value="Active" icon={Activity} color="emerald" />
    </StatsGrid>
  );
}
