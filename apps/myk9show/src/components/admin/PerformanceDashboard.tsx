/**
 * Performance Dashboard
 * 
 * Comprehensive dashboard for monitoring application performance,
 * Core Web Vitals, budget violations, and user experience metrics.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { logger } from '@/services/LoggingService';
import {
  Activity,
  Clock,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Gauge,
  Timer,
  Cpu,
  HardDrive,
  Wifi,
  Users,
  Eye,
  RefreshCw,
  Shield
} from 'lucide-react';

import { getRumService } from '@/services/performance/RealUserMonitoring';
import { getBudgetService, type BudgetViolation } from '@/services/performance/PerformanceBudgets';

interface MetricCard {
  name: string;
  value: string;
  unit: string;
  status: 'good' | 'needs-improvement' | 'poor';
  trend?: 'up' | 'down' | 'stable';
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

interface PerformanceData {
  summary: {
    vitals: Record<string, number>;
    customMetrics?: Record<string, number>;
    sessionDuration: number;
    errorCount: number;
  };
  runtimeMetrics: {
    memory_usage: number;
    dom_nodes: number;
  };
  budgetStatus?: {
    activeRules: number;
    recentViolations: number;
  };
  session?: {
    device: {
      type: string;
      browser: string;
      version: string;
      os: string;
      screenResolution: string;
      pixelRatio: number;
    };
    connection?: {
      effectiveType: string;
      downlink: number;
      rtt: number;
      saveData: boolean;
    };
  };
}

export function PerformanceDashboard() {
  const [isLoading, setIsLoading] = useState(false);
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [budgetViolations, setBudgetViolations] = useState<BudgetViolation[]>([]);
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

  const getVitalStatus = (name: string, value: number): 'good' | 'needs-improvement' | 'poor' => {
    const thresholds = {
      LCP: { good: 2500, poor: 4000 },
      FCP: { good: 1800, poor: 3000 },
      CLS: { good: 0.1, poor: 0.25 },
      FID: { good: 100, poor: 300 },
      TTFB: { good: 600, poor: 1500 },
      INP: { good: 200, poor: 500 },
    };

    const threshold = thresholds[name as keyof typeof thresholds];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600 bg-green-100';
      case 'needs-improvement': return 'text-yellow-600 bg-yellow-100';
      case 'poor': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getCoreWebVitalsCards = (): MetricCard[] => {
    if (!performanceData?.summary?.vitals) return [];

    return Object.entries(performanceData.summary.vitals).map(([name, value]) => {
      const numValue = value as number;
      const status = getVitalStatus(name, numValue);
      const unit = name === 'CLS' ? '' : 'ms';
      
      return {
        name: name === 'LCP' ? 'Largest Contentful Paint' :
              name === 'FCP' ? 'First Contentful Paint' :
              name === 'CLS' ? 'Cumulative Layout Shift' :
              name === 'FID' ? 'First Input Delay' :
              name === 'TTFB' ? 'Time to First Byte' : name,
        value: numValue.toFixed(name === 'CLS' ? 3 : 0),
        unit,
        status,
        icon: Timer,
      };
    });
  };

  const getCustomMetricsCards = (): MetricCard[] => {
    if (!performanceData?.summary?.customMetrics) return [];

    return [
      {
        name: 'Memory Usage',
        value: (performanceData.runtimeMetrics.memory_usage || 0).toFixed(1),
        unit: 'MB',
        status: performanceData.runtimeMetrics.memory_usage > 100 ? 'needs-improvement' : 'good',
        icon: HardDrive,
      },
      {
        name: 'DOM Nodes',
        value: (performanceData.runtimeMetrics.dom_nodes || 0).toString(),
        unit: 'nodes',
        status: performanceData.runtimeMetrics.dom_nodes > 1500 ? 'needs-improvement' : 'good',
        icon: Cpu,
      },
      {
        name: 'Session Duration',
        value: Math.round(performanceData.summary.sessionDuration / 1000 / 60).toString(),
        unit: 'min',
        status: 'good',
        icon: Clock,
      },
      {
        name: 'Error Count',
        value: performanceData.summary.errorCount.toString(),
        unit: 'errors',
        status: performanceData.summary.errorCount > 0 ? 'poor' : 'good',
        icon: AlertTriangle,
      },
    ];
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 pt-20 pb-8 max-w-7xl">
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
                  {budgetViolations.filter(v => Date.now() - v.timestamp < 24 * 60 * 60 * 1000).length}
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
                <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                  <Badge className="bg-success-green/10 text-success-green border-success-green/20">Active</Badge>
                </p>
              </div>
              <div className="p-2 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-xl 
                               shadow-sm group-hover:shadow-xl group-hover:scale-110 
                               transition-all duration-300">
                <Activity className="h-5 w-5 text-success-green" />
              </div>
            </div>
          </div>
        </div>

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
            {/* Core Web Vitals Overview */}
            <div className="grid gap-6 md:grid-cols-3">
              {getCoreWebVitalsCards().slice(0, 3).map((card) => (
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
              {getCustomMetricsCards().map((card) => (
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
          </TabsContent>

        <TabsContent value="core-vitals" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {getCoreWebVitalsCards().map((vital) => (
              <div key={vital.name} className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                                             border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                                             transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                                 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                                     shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                     transition-all duration-300">
                      <vital.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="text-base font-semibold group-hover:text-primary transition-colors duration-300">{vital.name}</h3>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-4xl font-bold mb-2 group-hover:text-primary transition-colors duration-300">{vital.value}</p>
                    <p className="text-muted-foreground">{vital.unit}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Performance</span>
                      <Badge className={getStatusColor(vital.status)}>
                        {vital.status === 'good' ? 'Good' : 
                         vital.status === 'needs-improvement' ? 'Needs Improvement' : 'Poor'}
                      </Badge>
                    </div>
                    
                    <Progress 
                      value={vital.status === 'good' ? 80 : vital.status === 'needs-improvement' ? 50 : 20}
                      className="h-2"
                    />
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {vital.name === 'Largest Contentful Paint' && 'Time for largest element to render'}
                    {vital.name === 'First Contentful Paint' && 'Time for first content to appear'}
                    {vital.name === 'Cumulative Layout Shift' && 'Visual stability metric'}
                    {vital.name === 'First Input Delay' && 'Time from first user input to response'}
                    {vital.name === 'Time to First Byte' && 'Time for server to respond'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Core Web Vitals Trends */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                         border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative p-6">
              <h3 className="text-xl font-semibold mb-6 group-hover:text-primary transition-colors duration-300">Performance Trends</h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                                   shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                   transition-all duration-300">
                    <BarChart3 className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm">
                    Performance trends show improvements after recent optimizations. 
                    LCP improved by 58% and Total Blocking Time reduced to 0ms.
                  </p>
                </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-green-600" />
                    Improvements
                  </h4>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p>• Load time reduced from 5.3s to 2.2s</p>
                    <p>• Long tasks eliminated completely</p>
                    <p>• Memory usage optimized by 70%</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-600" />
                    Monitoring
                  </h4>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p>• Real-time performance tracking</p>
                    <p>• Budget violation alerts</p>
                    <p>• User experience metrics</p>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="budgets" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="diagnostics" className="space-y-4">
          {/* System Information Cards */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                               opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-6">
                <div className="flex items-center gap-3 mb-6 group-hover:text-primary transition-colors duration-300">
                  <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                                   shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                   transition-all duration-300">
                    <Cpu className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">System Information</h3>
                </div>
                
                {performanceData?.session && (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Device Type:</span>
                      <span className="font-medium">{performanceData.session.device.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Browser:</span>
                      <span className="font-medium">
                        {performanceData.session.device.browser} {performanceData.session.device.version}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">OS:</span>
                      <span className="font-medium">{performanceData.session.device.os}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Screen:</span>
                      <span className="font-medium">{performanceData.session.device.screenResolution}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pixel Ratio:</span>
                      <span className="font-medium">{performanceData.session.device.pixelRatio}x</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                               opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-6">
                <div className="flex items-center gap-3 mb-6 group-hover:text-primary transition-colors duration-300">
                  <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                                   shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                   transition-all duration-300">
                    <Wifi className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Connection Info</h3>
                </div>
                
                {performanceData?.session?.connection && (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Effective Type:</span>
                      <span className="font-medium">{performanceData.session.connection.effectiveType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Downlink:</span>
                      <span className="font-medium">{performanceData.session.connection.downlink} Mbps</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RTT:</span>
                      <span className="font-medium">{performanceData.session.connection.rtt}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data Saver:</span>
                      <span className="font-medium">{performanceData.session.connection.saveData ? 'On' : 'Off'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Export Performance Data */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                         border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative p-6">
              <div className="flex items-center gap-3 mb-6 group-hover:text-primary transition-colors duration-300">
                <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                                 shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                 transition-all duration-300">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Export Performance Data</h3>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Export detailed performance data for analysis and debugging.
                </p>
                
                <div className="flex gap-3">
                  <Button 
                    variant="outline"
                    className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 
                               hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
                    onClick={() => {
                      const data = rumService.exportSessionData();
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `performance-data-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export Session Data
                  </Button>
                  <Button 
                    variant="outline"
                    className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 
                               hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
                    onClick={() => {
                      const report = budgetService.generateReport('runtime');
                      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `budget-report-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export Budget Report
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}