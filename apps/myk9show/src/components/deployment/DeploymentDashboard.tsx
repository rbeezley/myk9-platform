/**
 * Deployment Dashboard Component
 * 
 * Comprehensive dashboard for managing deployments, monitoring feature flags,
 * and tracking production health in real-time.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Rocket,
  AlertTriangle,
  CheckCircle,
  Clock,
  RotateCcw,
  Eye,
  TrendingUp,
  Shield,
  Monitor,
  Download,
  RefreshCw,
  GitBranch,
  Flag,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeploymentManager } from '@/services/deployment/DeploymentManager';
import { FeatureFlagService } from '@/services/deployment/FeatureFlagService';
import { ProductionMonitoringService } from '@/services/deployment/ProductionMonitoringService';
import {
  DeploymentConfig,
  FeatureFlagConfig,
  DeploymentEvent
} from '@/types/deployment-types';

interface DeploymentDashboardProps {
  className?: string;
}

interface DeploymentSummary {
  total: number;
  active: number;
  completed: number;
  failed: number;
  recent: DeploymentConfig[];
}

interface FeatureFlagSummary {
  total: number;
  enabled: number;
  disabled: number;
  rolloutInProgress: number;
  flags: FeatureFlagConfig[];
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number;
  checks: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
  }>;
  uptime: string;
}

export const DeploymentDashboard: React.FC<DeploymentDashboardProps> = ({
  className
}) => {
  // Services
  const deploymentManager = useMemo(() => DeploymentManager.getInstance(), []);
  const featureFlagService = useMemo(() => FeatureFlagService.getInstance(), []);
  const monitoringService = useMemo(() => ProductionMonitoringService.getInstance(), []);

  // State
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval] = useState(30);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Data state
  const [deploymentSummary, setDeploymentSummary] = useState<DeploymentSummary>({
    total: 0,
    active: 0,
    completed: 0,
    failed: 0,
    recent: []
  });
  
  const [featureFlagSummary, setFeatureFlagSummary] = useState<FeatureFlagSummary>({
    total: 0,
    enabled: 0,
    disabled: 0,
    rolloutInProgress: 0,
    flags: []
  });
  
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    status: 'healthy',
    score: 95,
    checks: [],
    uptime: '99.9%'
  });

  const [recentEvents, setRecentEvents] = useState<DeploymentEvent[]>([]);
  const [currentDeployment, setCurrentDeployment] = useState<DeploymentConfig | null>(null);

  const loadDeploymentData = useCallback(async () => {
    // Mock deployment data - in real implementation, this would come from the deployment service
    const mockDeployments: DeploymentConfig[] = [
      {
        deploymentId: 'deploy_001',
        environment: 'production',
        version: 'v2.1.0',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        features: [],
        migrations: [],
        rollbackStrategy: 'blue_green',
        healthChecks: []
      },
      {
        deploymentId: 'deploy_002',
        environment: 'staging',
        version: 'v2.2.0-beta',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        features: [],
        migrations: [],
        rollbackStrategy: 'rolling_back',
        healthChecks: []
      }
    ];

    setDeploymentSummary({
      total: mockDeployments.length,
      active: 1,
      completed: 1,
      failed: 0,
      recent: mockDeployments
    });

    if (mockDeployments.length > 0) {
      setCurrentDeployment(mockDeployments[0]);
    }
  }, []);

  const loadFeatureFlagData = useCallback(async () => {
    const flags = featureFlagService.getAllFlags();
    
    setFeatureFlagSummary({
      total: flags.length,
      enabled: flags.filter(f => f.enabled).length,
      disabled: flags.filter(f => !f.enabled).length,
      rolloutInProgress: flags.filter(f => f.enabled && f.rolloutPercentage < 100).length,
      flags: flags.slice(0, 10) // Show top 10
    });
  }, [featureFlagService]);

  const loadSystemHealthData = useCallback(async () => {
    const monitoringData = monitoringService.getDashboardData();
    
    // Calculate system health based on monitoring data
    const errorRate = monitoringData.errors.recent / Math.max(monitoringData.users.totalSessions, 1);
    const isHealthy = errorRate < 0.05 && monitoringData.alerts.active === 0;
    
    setSystemHealth({
      status: isHealthy ? 'healthy' : errorRate < 0.1 ? 'degraded' : 'unhealthy',
      score: Math.round((1 - errorRate) * 100),
      checks: [
        {
          name: 'API Health',
          status: 'healthy',
          responseTime: 120
        },
        {
          name: 'Database',
          status: 'healthy',
          responseTime: 45
        },
        {
          name: 'Cache Layer',
          status: 'healthy',
          responseTime: 8
        }
      ],
      uptime: '99.9%'
    });
  }, [monitoringService]);

  const loadRecentEvents = useCallback(async () => {
    const events = deploymentManager.getEvents();
    setRecentEvents(events.slice(-10)); // Last 10 events
  }, [deploymentManager]);

  // Data loading
  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Load deployment data
      await loadDeploymentData();
      
      // Load feature flag data
      await loadFeatureFlagData();
      
      // Load system health data
      await loadSystemHealthData();
      
      // Load recent events
      await loadRecentEvents();

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [loadDeploymentData, loadFeatureFlagData, loadSystemHealthData, loadRecentEvents]);

  // Effects
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadDashboardData, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, loadDashboardData]);

  // Action handlers
  const handleToggleFeatureFlag = async (flagId: string, enabled: boolean) => {
    await featureFlagService.updateFlag(flagId, { enabled });
    await loadFeatureFlagData();
  };

  const handleEmergencyRollback = async (flagId: string) => {
    await featureFlagService.emergencyRollback(flagId, 'Manual emergency rollback from dashboard');
    await loadFeatureFlagData();
  };

  const handleRefreshData = () => {
    loadDashboardData();
  };

  const handleExportData = () => {
    const data = {
      deployments: deploymentSummary,
      featureFlags: featureFlagSummary,
      systemHealth,
      events: recentEvents,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `deployment-dashboard-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'in_progress':
      case 'degraded':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'failed':
      case 'unhealthy':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'healthy':
        return <CheckCircle className="h-4 w-4" />;
      case 'in_progress':
        return <Clock className="h-4 w-4" />;
      case 'failed':
      case 'unhealthy':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (isLoading && !deploymentSummary.total) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading deployment dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deployment Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor deployments, feature flags, and production health
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <span className="text-sm text-muted-foreground">Auto-refresh</span>
          </div>
          
          <Button variant="outline" onClick={handleRefreshData} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          
          <Button variant="outline" onClick={handleExportData}>
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Health</CardTitle>
              <Shield className={cn("h-4 w-4", 
                systemHealth.status === 'healthy' ? 'text-green-600' : 
                systemHealth.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'
              )} />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                {getStatusIcon(systemHealth.status)}
                <div className="text-2xl font-bold">{systemHealth.score}%</div>
              </div>
              <p className="text-xs text-muted-foreground">
                Uptime: {systemHealth.uptime}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Deployments</CardTitle>
              <Rocket className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deploymentSummary.active}</div>
              <p className="text-xs text-muted-foreground">
                {deploymentSummary.total} total deployments
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Feature Flags</CardTitle>
              <Flag className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{featureFlagSummary.enabled}</div>
              <p className="text-xs text-muted-foreground">
                {featureFlagSummary.total} total flags
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
              <Clock className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {lastUpdated.toLocaleTimeString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {lastUpdated.toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="deployments">Deployments</TabsTrigger>
          <TabsTrigger value="feature-flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Deployments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <GitBranch className="h-5 w-5 mr-2" />
                  Recent Deployments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {deploymentSummary.recent.map((deployment) => (
                    <div key={deployment.deploymentId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <div className="font-medium">{deployment.version}</div>
                        <div className="text-sm text-muted-foreground">
                          {deployment.environment} • {formatDateTime(deployment.timestamp)}
                        </div>
                      </div>
                      <Badge className={getStatusColor('completed')}>
                        Completed
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* System Health Checks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Monitor className="h-5 w-5 mr-2" />
                  Health Checks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {systemHealth.checks.map((check, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(check.status)}
                        <span className="font-medium">{check.name}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {check.responseTime}ms
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="h-5 w-5 mr-2" />
                Recent Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentEvents.map((event) => (
                  <div key={event.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                    <div className={cn("p-1 rounded-full", 
                      event.severity === 'error' ? 'bg-red-100' :
                      event.severity === 'warning' ? 'bg-yellow-100' : 'bg-blue-100'
                    )}>
                      {event.severity === 'error' ? 
                        <AlertTriangle className="h-4 w-4 text-red-600" /> :
                        <Activity className="h-4 w-4 text-blue-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{event.message}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatDateTime(event.timestamp)} • {event.source}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployments" className="space-y-6">
          {/* Current Deployment Status */}
          {currentDeployment && (
            <Card>
              <CardHeader>
                <CardTitle>Current Deployment: {currentDeployment.version}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <h4 className="font-medium mb-2">Environment</h4>
                    <Badge variant="outline">{currentDeployment.environment}</Badge>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Rollback Strategy</h4>
                    <Badge variant="outline">{currentDeployment.rollbackStrategy}</Badge>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Started</h4>
                    <span className="text-sm">{formatDateTime(currentDeployment.timestamp)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deployment History */}
          <Card>
            <CardHeader>
              <CardTitle>Deployment History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {deploymentSummary.recent.map((deployment) => (
                  <div key={deployment.deploymentId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="font-medium">{deployment.version}</div>
                        <Badge className={getStatusColor('completed')}>
                          Completed
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                        <Button size="sm" variant="outline">
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Rollback
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                      <div>Environment: {deployment.environment}</div>
                      <div>Strategy: {deployment.rollbackStrategy}</div>
                      <div>Started: {formatDateTime(deployment.timestamp)}</div>
                      <div>Duration: ~2m 30s</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feature-flags" className="space-y-6">
          {/* Feature Flag Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-center">Enabled Flags</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-3xl font-bold text-green-600">{featureFlagSummary.enabled}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-center">Disabled Flags</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-3xl font-bold text-gray-600">{featureFlagSummary.disabled}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-center">In Rollout</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-3xl font-bold text-blue-600">{featureFlagSummary.rolloutInProgress}</div>
              </CardContent>
            </Card>
          </div>

          {/* Feature Flags List */}
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {featureFlagSummary.flags.map((flag) => (
                  <div key={flag.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="space-y-1">
                        <div className="font-medium">{flag.name}</div>
                        <div className="text-sm text-muted-foreground">{flag.description}</div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-sm">
                          {flag.rolloutPercentage}% rollout
                        </div>
                        <Switch
                          checked={flag.enabled}
                          onCheckedChange={(checked) => handleToggleFeatureFlag(flag.id, checked)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEmergencyRollback(flag.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Emergency Rollback
                        </Button>
                      </div>
                    </div>
                    
                    {flag.rolloutPercentage < 100 && flag.rolloutPercentage > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">Rollout Progress</span>
                          <span className="text-sm font-medium">{flag.rolloutPercentage}%</span>
                        </div>
                        <Progress value={flag.rolloutPercentage} className="h-2" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-6">
          {/* Production Monitoring Dashboard would go here */}
          <Card>
            <CardHeader>
              <CardTitle>Production Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Production Monitoring Dashboard</h3>
                <p className="text-muted-foreground mb-4">
                  Real-time monitoring, error tracking, and performance analytics
                </p>
                <Button>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  View Full Monitoring Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};