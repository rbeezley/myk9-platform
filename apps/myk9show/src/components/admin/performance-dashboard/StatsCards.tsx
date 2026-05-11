import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Gauge,
  Users,
  Activity,
} from 'lucide-react';
import type { PerformanceData } from './types';

interface StatsCardsProps {
  performanceData: PerformanceData | null;
  recentViolationCount: number;
}

export function StatsCards({ performanceData, recentViolationCount }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="group relative overflow-hidden p-6 rounded-2xl border border-border
                       bg-gradient-to-br from-card to-card/80 backdrop-blur-xl shadow-sm
                       hover:shadow-xl hover:-translate-y-2 transition-all duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                         opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Performance Score</p>
            <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300 text-success-green">Good</p>
          </div>
          <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl
                           shadow-sm group-hover:shadow-xl group-hover:scale-110
                           transition-all duration-300">
            <Gauge className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>

      <div className="group relative overflow-hidden p-6 rounded-2xl border border-border
                       bg-gradient-to-br from-card to-card/80 backdrop-blur-xl shadow-sm
                       hover:shadow-xl hover:-translate-y-2 transition-all duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                         opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Budget Violations</p>
            <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
              {recentViolationCount}
            </p>
          </div>
          <div className="p-2 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-xl
                           shadow-sm group-hover:shadow-xl group-hover:scale-110
                           transition-all duration-300">
            <AlertTriangle className="h-5 w-5 text-warning-orange" />
          </div>
        </div>
      </div>

      <div className="group relative overflow-hidden p-6 rounded-2xl border border-border
                       bg-gradient-to-br from-card to-card/80 backdrop-blur-xl shadow-sm
                       hover:shadow-xl hover:-translate-y-2 transition-all duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                         opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Session Duration</p>
            <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
              {performanceData ? Math.round(performanceData.summary.sessionDuration / 1000 / 60) : 0}min
            </p>
          </div>
          <div className="p-2 bg-gradient-to-br from-secondary-purple/20 to-secondary-purple/10 rounded-xl
                           shadow-sm group-hover:shadow-xl group-hover:scale-110
                           transition-all duration-300">
            <Users className="h-5 w-5 text-secondary-purple" />
          </div>
        </div>
      </div>

      <div className="group relative overflow-hidden p-6 rounded-2xl border border-border
                       bg-gradient-to-br from-card to-card/80 backdrop-blur-xl shadow-sm
                       hover:shadow-xl hover:-translate-y-2 transition-all duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                         opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Monitoring Status</p>
            <div className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
              <Badge className="bg-success-green/10 text-success-green border-success-green/20">Active</Badge>
            </div>
          </div>
          <div className="p-2 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-xl
                           shadow-sm group-hover:shadow-xl group-hover:scale-110
                           transition-all duration-300">
            <Activity className="h-5 w-5 text-success-green" />
          </div>
        </div>
      </div>
    </div>
  );
}
