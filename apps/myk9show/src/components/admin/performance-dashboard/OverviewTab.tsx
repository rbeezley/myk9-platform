import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import type { PerformanceData } from './types';
import type { BudgetViolation } from '@/services/performance/PerformanceBudgets';
import { getCoreWebVitalsCards, getCustomMetricsCards, getStatusColor } from './helpers';

interface OverviewTabProps {
  performanceData: PerformanceData | null;
  budgetViolations: BudgetViolation[];
}

export function OverviewTab({ performanceData, budgetViolations }: OverviewTabProps) {
  return (
    <div className="space-y-4">
      {/* Core Web Vitals Overview */}
      <div className="grid gap-6 md:grid-cols-3">
        {getCoreWebVitalsCards(performanceData).slice(0, 3).map((card) => (
          <div key={card.name} className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center">
              <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl
                               shadow-sm group-hover:shadow-xl group-hover:scale-110
                               transition-all duration-300 mr-3">
                <card.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">{card.name}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-2xl font-bold group-hover:text-primary transition-colors duration-300">{card.value}</span>
                  <span className="text-sm text-muted-foreground">{card.unit}</span>
                  <Badge className={getStatusColor(card.status)}>
                    {card.status === 'good' ? 'Good' :
                     card.status === 'needs-improvement' ? 'Fair' : 'Poor'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Custom Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        {getCustomMetricsCards(performanceData).map((card) => (
          <div key={card.name} className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                                         border border-border rounded-2xl p-4 shadow-sm backdrop-blur-xl
                                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center">
              <div className="p-2 bg-gradient-to-br from-muted to-muted/50 rounded-xl
                               shadow-sm group-hover:shadow-xl group-hover:scale-110
                               transition-all duration-300 mr-3">
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{card.name}</p>
                <p className="text-lg font-bold group-hover:text-primary transition-colors duration-300">{card.value} {card.unit}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Alerts */}
      <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                     border border-border rounded-2xl shadow-sm backdrop-blur-xl
                     transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                         opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative p-6">
          <div className="flex items-center gap-3 mb-6 group-hover:text-primary transition-colors duration-300">
            <div className="p-2 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-xl
                             shadow-sm group-hover:shadow-xl group-hover:scale-110
                             transition-all duration-300">
              <AlertTriangle className="h-5 w-5 text-warning-orange" />
            </div>
            <h3 className="text-xl font-semibold">Recent Performance Alerts</h3>
          </div>

          <div className="space-y-2">
            {budgetViolations.slice(0, 5).map((violation, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`h-4 w-4 ${
                    violation.severity === 'error' ? 'text-error-red' :
                    violation.severity === 'warning' ? 'text-warning-orange' : 'text-primary'
                  }`} />
                  <div>
                    <p className="font-medium">{violation.ruleName}</p>
                    <p className="text-sm text-muted-foreground">
                      {violation.actualValue.toFixed(2)} exceeded threshold of {violation.threshold}
                    </p>
                  </div>
                </div>
                <Badge variant={violation.severity === 'error' ? 'destructive' : 'secondary'}>
                  {violation.severity}
                </Badge>
              </div>
            ))}
            {budgetViolations.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <div className="w-16 h-16 bg-gradient-to-br from-success-green/10 to-success-green/5 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-success-green" />
                </div>
                <p>No performance violations detected</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
