import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle,
  Shield,
} from 'lucide-react';
import type { PerformanceData } from './types';
import type { BudgetViolation } from '@/services/performance/PerformanceBudgets';

interface BudgetsTabProps {
  performanceData: PerformanceData | null;
  budgetViolations: BudgetViolation[];
}

export function BudgetsTab({ performanceData, budgetViolations }: BudgetsTabProps) {
  return (
    <div className="space-y-4">
      {/* Performance Budget Status Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                       border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                       transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active Rules</p>
              <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                {performanceData?.budgetStatus?.activeRules || 0}
              </p>
            </div>
            <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl
                             shadow-sm group-hover:shadow-xl group-hover:scale-110
                             transition-all duration-300">
              <Shield className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                       border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                       transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-warning-orange/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Recent Violations</p>
              <p className="text-2xl font-bold mt-2 group-hover:text-warning-orange transition-colors duration-300">
                {performanceData?.budgetStatus?.recentViolations || 0}
              </p>
            </div>
            <div className="p-2 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-xl
                             shadow-sm group-hover:shadow-xl group-hover:scale-110
                             transition-all duration-300">
              <AlertTriangle className="h-5 w-5 text-warning-orange" />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                       border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                       transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-success-green/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Compliance Rate</p>
              <p className="text-2xl font-bold mt-2 group-hover:text-success-green transition-colors duration-300">
                {performanceData?.budgetStatus ?
                  Math.round((1 - performanceData.budgetStatus.recentViolations / performanceData.budgetStatus.activeRules) * 100)
                  : 100}%
              </p>
            </div>
            <div className="p-2 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-xl
                             shadow-sm group-hover:shadow-xl group-hover:scale-110
                             transition-all duration-300">
              <CheckCircle className="h-5 w-5 text-success-green" />
            </div>
          </div>
        </div>
      </div>

      {/* Budget Violations */}
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
            <h3 className="text-xl font-semibold">Budget Violations</h3>
          </div>

          <div className="space-y-3">
            {budgetViolations.map((violation, index) => (
              <div key={index} className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{violation.ruleName}</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant={violation.severity === 'error' ? 'destructive' : 'secondary'}>
                      {violation.severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(violation.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Metric: {violation.metric}</p>
                  <p>Value: {violation.actualValue.toFixed(2)} (threshold: {violation.threshold})</p>
                  <p>Excess: {(violation.actualValue - violation.threshold).toFixed(2)}</p>
                </div>
              </div>
            ))}

            {budgetViolations.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <div className="w-16 h-16 bg-gradient-to-br from-success-green/10 to-success-green/5 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-success-green" />
                </div>
                <p>All performance budgets are within limits</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
