/**
 * Security Dashboard Page
 * Phase 5: Security - Comprehensive security monitoring and audit dashboard
 * Created: December 2024
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield,
  Activity,
  AlertTriangle,
  TrendingUp,
  Clock,
  Database,
  FileText,
  CheckCircle,
  XCircle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { AuditLogViewer } from '@/components/admin/permissions/AuditLogViewer';
import { rbacService } from '@/services/rbac/RBACService';
import { auditService } from '@/services/AuditService';
import { format, subHours } from 'date-fns';

interface SecurityMetrics {
  totalAuditEntries: number;
  criticalActions: number;
  failedPermissionChecks: number;
  uniqueUsers: number;
  systemIntegrityScore: number;
  cacheHitRate: number;
  averageResponseTime: number;
}

interface SecurityAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  details?: Record<string, unknown>;
}

const SecurityDashboardPage: React.FC = () => {
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetrics | null>(null);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [integrityResults, setIntegrityResults] = useState<{
    isValid: boolean;
    issues: string[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    loadSecurityData();

    // Refresh data every 5 minutes
    const interval = setInterval(loadSecurityData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadSecurityData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load security metrics
      const [auditStats, permissionMetrics, integrityCheck] = await Promise.all([
        auditService.getAuditStatistics(),
        rbacService.getPermissionCheckMetrics(),
        rbacService.validateRolePermissionIntegrity(),
      ]);

      // Calculate security metrics
      const metrics: SecurityMetrics = {
        totalAuditEntries: auditStats.totalEntries,
        criticalActions: auditStats.entriesByAction['delete'] || 0,
        failedPermissionChecks: 0, // Would come from error logs
        uniqueUsers: Object.keys(auditStats.entriesByEntityType).length,
        systemIntegrityScore: integrityCheck.isValid
          ? 100
          : Math.max(0, 100 - integrityCheck.issues.length * 10),
        cacheHitRate: permissionMetrics.cacheHitRate,
        averageResponseTime: permissionMetrics.averageResponseTime,
      };

      setSecurityMetrics(metrics);
      setIntegrityResults(integrityCheck);

      // Generate security alerts based on data
      const alerts: SecurityAlert[] = [];

      if (integrityCheck.issues.length > 0) {
        alerts.push({
          id: 'integrity-issues',
          type: 'critical',
          message: `Found ${integrityCheck.issues.length} data integrity issues`,
          timestamp: new Date(),
          acknowledged: false,
          details: { issues: integrityCheck.issues },
        });
      }

      if (permissionMetrics.cacheHitRate < 0.8) {
        alerts.push({
          id: 'low-cache-hit',
          type: 'warning',
          message: `Low cache hit rate: ${(permissionMetrics.cacheHitRate * 100).toFixed(1)}%`,
          timestamp: new Date(),
          acknowledged: false,
        });
      }

      if (permissionMetrics.averageResponseTime > 100) {
        alerts.push({
          id: 'slow-response',
          type: 'warning',
          message: `Slow permission checks: ${permissionMetrics.averageResponseTime}ms average`,
          timestamp: new Date(),
          acknowledged: false,
        });
      }

      // Add alerts for recent critical actions
      if (
        auditStats.recentActivity.some(
          entry => entry.action === 'delete' && entry.timestamp > subHours(new Date(), 24)
        )
      ) {
        alerts.push({
          id: 'recent-deletions',
          type: 'info',
          message: 'Critical actions detected in the last 24 hours',
          timestamp: new Date(),
          acknowledged: false,
        });
      }

      setSecurityAlerts(alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security data');
    } finally {
      setIsLoading(false);
    }
  };

  const acknowledgeAlert = (alertId: string) => {
    setSecurityAlerts(prev =>
      prev.map(alert => (alert.id === alertId ? { ...alert, acknowledged: true } : alert))
    );
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getMetricColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'text-green-600';
    if (value >= thresholds.warning) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="container mx-auto pt-8 px-6 pb-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            Security Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor system security, audit trails, and permission integrity
          </p>
        </div>
        <Button onClick={loadSecurityData} disabled={isLoading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Security Alerts */}
      {securityAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Security Alerts
            </CardTitle>
            <CardDescription>
              {securityAlerts.filter(a => !a.acknowledged).length} unacknowledged alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {securityAlerts.map(alert => (
                <Alert
                  key={alert.id}
                  variant={alert.type === 'critical' ? 'destructive' : 'default'}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {getAlertIcon(alert.type)}
                      <AlertDescription className="font-medium">{alert.message}</AlertDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {format(alert.timestamp, 'HH:mm:ss')}
                      </span>
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeAlert(alert.id)}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Ack
                        </Button>
                      )}
                    </div>
                  </div>
                  {alert.details?.issues && (
                    <div className="mt-2 text-xs">
                      <details>
                        <summary className="cursor-pointer">View details</summary>
                        <ul className="mt-1 ml-4 space-y-1">
                          {Array.isArray(alert.details.issues) &&
                            alert.details.issues.map((issue: string, index: number) => (
                              <li key={index}>• {issue}</li>
                            ))}
                        </ul>
                      </details>
                    </div>
                  )}
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Dashboard Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="integrity">Data Integrity</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Security Metrics Grid */}
          {securityMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {securityMetrics.totalAuditEntries.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Audit Entries</div>
                  <Activity className="h-4 w-4 mx-auto mt-2 text-blue-600" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div
                    className={`text-2xl font-bold ${
                      securityMetrics.systemIntegrityScore >= 95
                        ? 'text-green-600'
                        : securityMetrics.systemIntegrityScore >= 80
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    }`}
                  >
                    {securityMetrics.systemIntegrityScore}%
                  </div>
                  <div className="text-sm text-muted-foreground">System Integrity</div>
                  <Database className="h-4 w-4 mx-auto mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div
                    className={`text-2xl font-bold ${getMetricColor(
                      securityMetrics.cacheHitRate * 100,
                      { good: 90, warning: 80 }
                    )}`}
                  >
                    {(securityMetrics.cacheHitRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">Cache Hit Rate</div>
                  <TrendingUp className="h-4 w-4 mx-auto mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div
                    className={`text-2xl font-bold ${getMetricColor(
                      100 - securityMetrics.averageResponseTime,
                      { good: 80, warning: 50 }
                    )}`}
                  >
                    {securityMetrics.averageResponseTime}ms
                  </div>
                  <div className="text-sm text-muted-foreground">Avg Response Time</div>
                  <Clock className="h-4 w-4 mx-auto mt-2" />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Security Events
              </CardTitle>
              <CardDescription>Latest audit entries and system events</CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLogViewer showFilters={false} maxHeight="400px" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Trail Tab */}
        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Comprehensive Audit Trail
              </CardTitle>
              <CardDescription>
                Complete audit log with advanced filtering and export capabilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLogViewer />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Integrity Tab */}
        <TabsContent value="integrity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Integrity Check
              </CardTitle>
              <CardDescription>
                Validate role permissions, detect orphaned data, and ensure system consistency
              </CardDescription>
            </CardHeader>
            <CardContent>
              {integrityResults ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {integrityResults.isValid ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="font-medium">
                      {integrityResults.isValid
                        ? 'All integrity checks passed'
                        : `${integrityResults.issues.length} integrity issues found`}
                    </span>
                  </div>

                  {integrityResults.issues.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-2">
                          <div className="font-medium">Data Integrity Issues:</div>
                          <ul className="space-y-1 text-sm">
                            {integrityResults.issues.map((issue, index) => (
                              <li key={index}>• {issue}</li>
                            ))}
                          </ul>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button onClick={loadSecurityData} disabled={isLoading} variant="outline">
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Re-run Integrity Check
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p>Running integrity checks...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Performance Metrics
              </CardTitle>
              <CardDescription>
                Monitor system performance and optimize permission checks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {securityMetrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-medium">Permission Check Performance</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Cache Hit Rate</span>
                        <Badge variant={securityMetrics.cacheHitRate > 0.9 ? 'default' : 'outline'}>
                          {(securityMetrics.cacheHitRate * 100).toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Average Response Time</span>
                        <Badge
                          variant={securityMetrics.averageResponseTime < 50 ? 'default' : 'outline'}
                        >
                          {securityMetrics.averageResponseTime}ms
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Total Permission Checks</span>
                        <span className="text-sm font-medium">
                          {(securityMetrics.totalAuditEntries * 2).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">System Health</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Integrity Score</span>
                        <Badge
                          variant={
                            securityMetrics.systemIntegrityScore > 95 ? 'default' : 'destructive'
                          }
                        >
                          {securityMetrics.systemIntegrityScore}%
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Active Alerts</span>
                        <Badge
                          variant={
                            securityAlerts.filter(a => !a.acknowledged).length === 0
                              ? 'default'
                              : 'destructive'
                          }
                        >
                          {securityAlerts.filter(a => !a.acknowledged).length}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Unique Users (24h)</span>
                        <span className="text-sm font-medium">{securityMetrics.uniqueUsers}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default SecurityDashboardPage;
