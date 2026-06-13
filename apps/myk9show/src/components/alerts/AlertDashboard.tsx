// Alert Management Dashboard Component

import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  MoreHorizontal,
  Eye,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import AlertingService from '../../services/alerts/AlertingService';
import {
  Alert,
  AlertSeverity,
  AlertStatus,
  AlertType,
  AlertStatistics,
  AlertQuery,
} from '../../types/alert-types';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../lib/utils';

interface AlertDashboardProps {
  className?: string;
}

export const AlertDashboard: React.FC<AlertDashboardProps> = ({ className }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statistics, setStatistics] = useState<AlertStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter] = useState<AlertStatus | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<AlertType | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [activeTab, setActiveTab] = useState('active');

  const alertingService = AlertingService.getInstance();
  const ITEMS_PER_PAGE = 20;

  const buildQuery = useCallback((): AlertQuery => {
    const query: AlertQuery = {
      limit: ITEMS_PER_PAGE,
      offset: currentPage * ITEMS_PER_PAGE,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };

    // Tab-based status filtering
    switch (activeTab) {
      case 'active':
        query.status = [AlertStatus.ACTIVE];
        break;
      case 'acknowledged':
        query.status = [AlertStatus.ACKNOWLEDGED];
        break;
      case 'resolved':
        query.status = [AlertStatus.RESOLVED];
        break;
      default:
        // Show all alerts for 'all' tab
        break;
    }

    // Apply additional filters
    if (statusFilter !== 'all') {
      query.status = [statusFilter as AlertStatus];
    }

    if (severityFilter !== 'all') {
      query.severity = [severityFilter as AlertSeverity];
    }

    if (typeFilter !== 'all') {
      query.type = [typeFilter as AlertType];
    }

    return query;
  }, [currentPage, activeTab, statusFilter, severityFilter, typeFilter]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const stats = alertingService.getAlertStatistics();
      setStatistics(stats);

      const query = buildQuery();
      const alertData = alertingService.getAlerts(query);
      setAlerts(alertData);
    } catch (error) {
      logger.error('Failed to load alert data:', 'alerts', {}, error as Error);
    } finally {
      setLoading(false);
    }
  }, [alertingService, buildQuery]);

  useEffect(() => {
    loadData();

    const handleAlertUpdate = () => {
      loadData();
    };

    alertingService.on('alert_created', handleAlertUpdate);
    alertingService.on('alert_resolved', handleAlertUpdate);
    alertingService.on('alert_acknowledged', handleAlertUpdate);
    alertingService.on('alert_updated', handleAlertUpdate);

    return () => {
      alertingService.off('alert_created', handleAlertUpdate);
      alertingService.off('alert_resolved', handleAlertUpdate);
      alertingService.off('alert_acknowledged', handleAlertUpdate);
      alertingService.off('alert_updated', handleAlertUpdate);
    };
  }, [alertingService, loadData]);

  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, statusFilter, severityFilter, typeFilter, activeTab]);

  const handleAlertAction = async (
    alertId: string,
    action: 'acknowledge' | 'resolve' | 'snooze'
  ) => {
    try {
      switch (action) {
        case 'acknowledge':
          await alertingService.acknowledgeAlert(alertId);
          break;
        case 'resolve':
          await alertingService.resolveAlert(alertId);
          break;
        case 'snooze':
          await alertingService.snoozeAlert(alertId, 30 * 60 * 1000); // 30 minutes
          break;
      }
    } catch (error) {
      logger.error(`Failed to ${action} alert:`, 'alerts', {}, error as Error);
    }
  };

  const getAlertIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case AlertSeverity.HIGH:
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case AlertSeverity.MEDIUM:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: AlertSeverity): string => {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return 'bg-red-500/10 text-destructive border-red-200 ';
      case AlertSeverity.HIGH:
        return 'bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-400';
      case AlertSeverity.MEDIUM:
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400';
      default:
        return 'bg-blue-500/10 text-info border-blue-200 ';
    }
  };

  const getStatusColor = (status: AlertStatus): string => {
    switch (status) {
      case AlertStatus.ACTIVE:
        return 'bg-red-500/10 text-red-700 border-red-200';
      case AlertStatus.ACKNOWLEDGED:
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
      case AlertStatus.RESOLVED:
        return 'bg-green-500/10 text-green-700 border-green-200';
      case AlertStatus.SNOOZED:
        return 'bg-purple-500/10 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-200';
    }
  };

  const getTypeLabel = (type: AlertType): string => {
    switch (type) {
      case AlertType.SYNC_FAILURE:
        return 'Sync Failure';
      case AlertType.CONFLICT_SURGE:
        return 'Conflict Surge';
      case AlertType.PERFORMANCE_DEGRADATION:
        return 'Performance';
      case AlertType.DATA_INTEGRITY:
        return 'Data Integrity';
      case AlertType.NETWORK_CONNECTIVITY:
        return 'Network';
      case AlertType.STORAGE_QUOTA:
        return 'Storage';
      default:
        return 'Custom';
    }
  };

  const filteredAlerts = alerts.filter(
    alert =>
      alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && !statistics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading alerts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Dashboard-Specific Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Critical Alerts Card - Unique to dashboard */}
          <div
            className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Critical Alerts
                </p>
                <p className="text-2xl font-bold mt-2 text-red-600 group-hover:scale-105 transition-transform duration-300">
                  {statistics.bySeverity[AlertSeverity.CRITICAL] || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Requires immediate attention</p>
              </div>
              <div
                className="p-2 bg-gradient-to-br from-red-500/20 to-red-500/10 rounded-xl 
                               shadow-sm group-hover:shadow-xl group-hover:scale-110 
                               transition-all duration-300"
              >
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </div>

          {/* Resolved Today Card - Unique to dashboard */}
          <div
            className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Resolved Today
                </p>
                <p className="text-2xl font-bold mt-2 text-green-600 group-hover:scale-105 transition-transform duration-300">
                  {statistics.byStatus[AlertStatus.RESOLVED] || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Issues resolved</p>
              </div>
              <div
                className="p-2 bg-gradient-to-br from-green-500/20 to-green-500/10 rounded-xl 
                               shadow-sm group-hover:shadow-xl group-hover:scale-110 
                               transition-all duration-300"
              >
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </div>

          {/* Response Time Card - Unique to dashboard */}
          <div
            className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Response Time
                </p>
                <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                  2.3m
                </p>
                <p className="text-xs text-muted-foreground mt-1">Average acknowledgment time</p>
              </div>
              <div
                className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                               shadow-sm group-hover:shadow-xl group-hover:scale-110 
                               transition-all duration-300"
              >
                <Clock className="h-5 w-5 text-primary" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search alerts..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Select
                value={severityFilter}
                onValueChange={value => setSeverityFilter(value as AlertSeverity | 'all')}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value={AlertSeverity.CRITICAL}>Critical</SelectItem>
                  <SelectItem value={AlertSeverity.HIGH}>High</SelectItem>
                  <SelectItem value={AlertSeverity.MEDIUM}>Medium</SelectItem>
                  <SelectItem value={AlertSeverity.LOW}>Low</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={typeFilter}
                onValueChange={value => setTypeFilter(value as AlertType | 'all')}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value={AlertType.SYNC_FAILURE}>Sync Failure</SelectItem>
                  <SelectItem value={AlertType.CONFLICT_SURGE}>Conflict Surge</SelectItem>
                  <SelectItem value={AlertType.PERFORMANCE_DEGRADATION}>Performance</SelectItem>
                  <SelectItem value={AlertType.DATA_INTEGRITY}>Data Integrity</SelectItem>
                  <SelectItem value={AlertType.NETWORK_CONNECTIVITY}>Network</SelectItem>
                  <SelectItem value={AlertType.STORAGE_QUOTA}>Storage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Premium Alert Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          className="grid w-full grid-cols-4 bg-gradient-to-r from-muted/50 to-muted/30 
                             border border-border/30 rounded-xl p-1"
        >
          <TabsTrigger
            value="active"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 
                       data-[state=active]:to-primary/5 data-[state=active]:text-primary 
                       data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Active ({statistics?.byStatus[AlertStatus.ACTIVE] || 0})
          </TabsTrigger>
          <TabsTrigger
            value="acknowledged"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 
                       data-[state=active]:to-primary/5 data-[state=active]:text-primary 
                       data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Acknowledged ({statistics?.byStatus[AlertStatus.ACKNOWLEDGED] || 0})
          </TabsTrigger>
          <TabsTrigger
            value="resolved"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 
                       data-[state=active]:to-primary/5 data-[state=active]:text-primary 
                       data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Resolved ({statistics?.byStatus[AlertStatus.RESOLVED] || 0})
          </TabsTrigger>
          <TabsTrigger
            value="snoozed"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 
                       data-[state=active]:to-primary/5 data-[state=active]:text-primary 
                       data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Snoozed ({statistics?.byStatus[AlertStatus.SNOOZED] || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Alerts</span>
                <Badge variant="secondary">{filteredAlerts.length} alerts</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-96">
                {filteredAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
                    <p className="text-lg font-medium">No alerts found</p>
                    <p className="text-sm text-muted-foreground">
                      {activeTab === 'active'
                        ? 'No active alerts - system is running smoothly'
                        : `No ${activeTab} alerts to display`}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredAlerts.map(alert => (
                      <div key={alert.id} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            <div className="mt-0.5">{getAlertIcon(alert.severity)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-2">
                                <Badge
                                  variant="outline"
                                  className={cn('text-xs', getSeverityColor(alert.severity))}
                                >
                                  {alert.severity.toUpperCase()}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={cn('text-xs', getStatusColor(alert.status))}
                                >
                                  {alert.status.toUpperCase()}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {getTypeLabel(alert.type)}
                                </Badge>
                                {alert.count > 1 && (
                                  <Badge variant="outline" className="text-xs">
                                    {alert.count}x
                                  </Badge>
                                )}
                              </div>
                              <h4 className="text-sm font-medium text-foreground mb-1">
                                {alert.title}
                              </h4>
                              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                                {alert.message}
                              </p>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>
                                  Created{' '}
                                  {formatDistanceToNow(alert.createdAt, { addSuffix: true })}
                                </span>
                                {alert.acknowledgedAt && (
                                  <span>
                                    Acknowledged{' '}
                                    {formatDistanceToNow(alert.acknowledgedAt, { addSuffix: true })}
                                  </span>
                                )}
                                {alert.resolvedAt && (
                                  <span>
                                    Resolved{' '}
                                    {formatDistanceToNow(alert.resolvedAt, { addSuffix: true })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild nativeButton>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  logger.debug('View details', 'alerts', { alertId: alert.id })
                                }
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {alert.status === AlertStatus.ACTIVE && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleAlertAction(alert.id, 'acknowledge')}
                                  >
                                    <Check className="mr-2 h-4 w-4" />
                                    Acknowledge
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleAlertAction(alert.id, 'snooze')}
                                  >
                                    <Clock className="mr-2 h-4 w-4" />
                                    Snooze 30m
                                  </DropdownMenuItem>
                                </>
                              )}
                              {alert.status !== AlertStatus.RESOLVED && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleAlertAction(alert.id, 'resolve')}
                                    className="text-green-600"
                                  >
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Resolve
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pagination */}
      {filteredAlerts.length >= ITEMS_PER_PAGE && (
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
            disabled={currentPage === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {currentPage + 1}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => prev + 1)}
            disabled={filteredAlerts.length < ITEMS_PER_PAGE}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default AlertDashboard;
