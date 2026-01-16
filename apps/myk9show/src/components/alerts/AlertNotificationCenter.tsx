// Alert Notification Center Component

import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Card, CardContent } from '../ui/card';
import AlertingService from '../../services/alerts/AlertingService';
import { Alert, AlertSeverity, AlertStatus, AlertType } from '../../types/alert-types';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../lib/utils';

interface AlertNotificationCenterProps {
  className?: string;
  maxAlerts?: number;
}

export const AlertNotificationCenter: React.FC<AlertNotificationCenterProps> = ({
  className,
  maxAlerts = 10
}) => {
  const alertingService = AlertingService.getInstance();

  // Initialize state with data from the service
  const getInitialAlerts = () => alertingService.getAlerts({
    status: [AlertStatus.ACTIVE],
    limit: maxAlerts,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });

  const [alerts, setAlerts] = useState<Alert[]>(getInitialAlerts);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(() => getInitialAlerts().length);

  useEffect(() => {
    // Listen for new alerts
    const handleNewAlert = (alert: Alert) => {
      setAlerts(prev => [alert, ...prev.slice(0, maxAlerts - 1)]);
      setUnreadCount(prev => prev + 1);
    };

    const handleAlertResolved = (alert: Alert) => {
      setAlerts(prev => prev.filter(a => a.id !== alert.id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    };

    const handleAlertAcknowledged = (alert: Alert) => {
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a));
    };

    // Type-safe event handlers
    const handleNewAlertTyped = (data: unknown) => {
      handleNewAlert(data as Alert);
    };
    const handleAlertResolvedTyped = (data: unknown) => {
      handleAlertResolved(data as Alert);
    };
    const handleAlertAcknowledgedTyped = (data: unknown) => {
      handleAlertAcknowledged(data as Alert);
    };

    alertingService.on('alert_created', handleNewAlertTyped);
    alertingService.on('alert_resolved', handleAlertResolvedTyped);
    alertingService.on('alert_acknowledged', handleAlertAcknowledgedTyped);

    return () => {
      alertingService.off('alert_created', handleNewAlertTyped);
      alertingService.off('alert_resolved', handleAlertResolvedTyped);
      alertingService.off('alert_acknowledged', handleAlertAcknowledgedTyped);
    };
  }, [alertingService, maxAlerts]);

  const handleAlertClick = async (alert: Alert) => {
    if (alert.status === AlertStatus.ACTIVE) {
      await alertingService.acknowledgeAlert(alert.id);
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleDismissAlert = async (alert: Alert, event: React.MouseEvent) => {
    event.stopPropagation();
    await alertingService.resolveAlert(alert.id);
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
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: AlertSeverity): string => {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return 'bg-red-500/10 text-red-700 border-red-200';
      case AlertSeverity.HIGH:
        return 'bg-orange-500/10 text-orange-700 border-orange-200';
      case AlertSeverity.MEDIUM:
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
      default:
        return 'bg-blue-500/10 text-blue-700 border-blue-200';
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
        return 'Alert';
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("relative p-2", className)}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Alerts</h3>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unreadCount} new
            </Badge>
          )}
        </div>
        
        <ScrollArea className="h-96">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
              <p className="text-sm text-muted-foreground">
                No active alerts
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                System is running smoothly
              </p>
            </div>
          ) : (
            <div className="p-2">
              {alerts.map((alert, index) => (
                <React.Fragment key={alert.id}>
                  <Card
                    className={cn(
                      "mb-2 cursor-pointer transition-all duration-200 hover:shadow-md",
                      alert.status === AlertStatus.ACTIVE
                        ? "border-l-4 border-l-primary"
                        : "opacity-70"
                    )}
                    onClick={() => handleAlertClick(alert)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          <div className="mt-0.5">
                            {getAlertIcon(alert.severity)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <Badge
                                variant="outline"
                                className={cn("text-xs", getSeverityColor(alert.severity))}
                              >
                                {alert.severity.toUpperCase()}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {getTypeLabel(alert.type)}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium text-foreground mb-1 line-clamp-2">
                              {alert.title}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {alert.message}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(alert.createdAt, { addSuffix: true })}
                              </span>
                              {alert.count > 1 && (
                                <Badge variant="outline" className="text-xs">
                                  {alert.count}x
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                          onClick={(e) => handleDismissAlert(alert, e)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  {index < alerts.length - 1 && <Separator className="my-1" />}
                </React.Fragment>
              ))}
            </div>
          )}
        </ScrollArea>
        
        {alerts.length > 0 && (
          <>
            <Separator />
            <div className="p-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setIsOpen(false);
                  // Navigate to alerts page
                  window.location.href = '/alerts';
                }}
              >
                View All Alerts
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default AlertNotificationCenter;