/**
 * Performance Dashboard
 *
 * Comprehensive dashboard for monitoring application performance,
 * Core Web Vitals, budget violations, and user experience metrics.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logger } from '@/services/LoggingService';
import { RefreshCw } from 'lucide-react';

import { getRumService } from '@/services/performance/RealUserMonitoring';
import { getBudgetService, type BudgetViolation } from '@/services/performance/PerformanceBudgets';

import type { PerformanceData } from './performance-dashboard/types';
import { StatsCards } from './performance-dashboard/StatsCards';
import { OverviewTab } from './performance-dashboard/OverviewTab';
import { CoreVitalsTab } from './performance-dashboard/CoreVitalsTab';
import { BudgetsTab } from './performance-dashboard/BudgetsTab';
import { DiagnosticsTab } from './performance-dashboard/DiagnosticsTab';

export function PerformanceDashboard() {
  const [isLoading, setIsLoading] = useState(false);
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [budgetViolations, setBudgetViolations] = useState<BudgetViolation[]>([]);
  const [recentViolationCount, setRecentViolationCount] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');

  const rumService = getRumService();
  const budgetService = getBudgetService();

  const loadPerformanceData = useCallback(async () => {
    setIsLoading(true);
    try {
      const sessionData = rumService.getSessionData();
      const summary = rumService.getPerformanceSummary();
      const runtimeMetrics = budgetService.extractRuntimeMetrics();
      const violations = budgetService.getViolationHistory(20);
      const budgetStatus = budgetService.getStatusSummary();

      setPerformanceData({
        session: sessionData,
        summary,
        runtimeMetrics,
        budgetStatus,
      });
      setBudgetViolations(violations);
      const now = Date.now();
      setRecentViolationCount(
        violations.filter(v => now - v.timestamp < 24 * 60 * 60 * 1000).length
      );
    } catch (error) {
      logger.error('Failed to load performance data:', 'admin', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [rumService, budgetService]);

  useEffect(() => {
    loadPerformanceData();

    // Set up periodic refresh
    const interval = setInterval(loadPerformanceData, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [loadPerformanceData]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl">
        {/* Header following dashboard layout pattern */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Performance Dashboard</h1>
            <p className="text-muted-foreground text-lg">
              Monitor Core Web Vitals, budget violations, and user experience metrics
            </p>
          </div>
          <div className="flex items-center gap-3 mt-4 md:mt-0">
            <Button
              variant="outline"
              className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40
                         hover:-translate-y-0.5 transition-all duration-300 shadow-sm rounded-full"
              onClick={loadPerformanceData}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards - Enhanced Premium Styling */}
        <StatsCards performanceData={performanceData} recentViolationCount={recentViolationCount} />

        {/* Main Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="core-vitals"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
            >
              Core Web Vitals
            </TabsTrigger>
            <TabsTrigger
              value="budgets"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
            >
              Budget Monitoring
            </TabsTrigger>
            <TabsTrigger
              value="diagnostics"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
            >
              Diagnostics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <OverviewTab performanceData={performanceData} budgetViolations={budgetViolations} />
          </TabsContent>

          <TabsContent value="core-vitals" className="space-y-4">
            <CoreVitalsTab performanceData={performanceData} />
          </TabsContent>

          <TabsContent value="budgets" className="space-y-4">
            <BudgetsTab performanceData={performanceData} budgetViolations={budgetViolations} />
          </TabsContent>

          <TabsContent value="diagnostics" className="space-y-4">
            <DiagnosticsTab performanceData={performanceData} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
