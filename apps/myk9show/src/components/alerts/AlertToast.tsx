// Alert Toast Notification Component

import React, { useState, useEffect, useCallback } from 'react';
import { X, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Alert, AlertSeverity, AlertType } from '../../types/alert-types';
import { cn } from '../../lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface AlertToastProps {
  alert: Alert;
  onDismiss: () => void;
  onAcknowledge?: () => void;
  onResolve?: () => void;
  autoHideDuration?: number;
  className?: string;
}

interface AlertToastContainerProps {
  alerts: Alert[];
  onDismiss: (alertId: string) => void;
  onAcknowledge?: (alertId: string) => void;
  onResolve?: (alertId: string) => void;
  maxToasts?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  className?: string;
}

export const AlertToast: React.FC<AlertToastProps> = ({
  alert,
  onDismiss,
  onAcknowledge,
  onResolve,
  autoHideDuration = 0, // 0 means no auto-hide
  className
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 300);
  }, [onDismiss]);

  useEffect(() => {
    if (autoHideDuration > 0 && alert.severity !== AlertSeverity.CRITICAL) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoHideDuration);

      return () => clearTimeout(timer);
    }
  }, [autoHideDuration, alert.severity, handleDismiss]);

  const handleAcknowledge = () => {
    if (onAcknowledge) {
      onAcknowledge();
    }
    handleDismiss();
  };

  const handleResolve = () => {
    if (onResolve) {
      onResolve();
    }
    handleDismiss();
  };

  const getAlertIcon = () => {
    switch (alert.severity) {
      case AlertSeverity.CRITICAL:
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case AlertSeverity.HIGH:
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case AlertSeverity.MEDIUM:
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getSeverityStyles = (): string => {
    switch (alert.severity) {
      case AlertSeverity.CRITICAL:
        return 'border-l-red-500 bg-red-50 dark:bg-red-950';
      case AlertSeverity.HIGH:
        return 'border-l-orange-500 bg-orange-50 dark:bg-orange-950';
      case AlertSeverity.MEDIUM:
        return 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950';
      default:
        return 'border-l-blue-500 bg-blue-50 dark:bg-blue-950';
    }
  };

  const getTypeLabel = (): string => {
    switch (alert.type) {
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

  if (!isVisible) return null;

  return (
    <Card
      className={cn(
        'w-80 shadow-lg border-l-4 transition-all duration-300 ease-in-out',
        getSeverityStyles(),
        isExiting ? 'transform translate-x-full opacity-0' : 'transform translate-x-0 opacity-100',
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 mt-0.5">
            {getAlertIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-2">
              <Badge variant="outline" className="text-xs">
                {alert.severity.toUpperCase()}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {getTypeLabel()}
              </Badge>
              {alert.count > 1 && (
                <Badge variant="outline" className="text-xs">
                  {alert.count}x
                </Badge>
              )}
            </div>
            
            <h4 className="font-medium text-sm text-foreground mb-1">
              {alert.title}
            </h4>
            
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {alert.message}
            </p>
            
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
              <span>
                {formatDistanceToNow(alert.createdAt, { addSuffix: true })}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              {onAcknowledge && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAcknowledge}
                  className="text-xs h-7 px-2"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Acknowledge
                </Button>
              )}
              
              {onResolve && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResolve}
                  className="text-xs h-7 px-2"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Resolve
                </Button>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="ml-auto text-xs h-7 w-7 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const AlertToastContainer: React.FC<AlertToastContainerProps> = ({
  alerts,
  onDismiss,
  onAcknowledge,
  onResolve,
  maxToasts = 5,
  position = 'top-right',
  className
}) => {
  const displayedAlerts = alerts.slice(0, maxToasts);
  
  const getPositionStyles = (): string => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      default:
        return 'top-4 right-4';
    }
  };

  if (displayedAlerts.length === 0) return null;

  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col space-y-2',
        getPositionStyles(),
        className
      )}
    >
      {displayedAlerts.map((alert, index) => (
        <AlertToast
          key={alert.id}
          alert={alert}
          onDismiss={() => onDismiss(alert.id)}
          onAcknowledge={onAcknowledge ? () => onAcknowledge(alert.id) : undefined}
          onResolve={onResolve ? () => onResolve(alert.id) : undefined}
          autoHideDuration={
            alert.severity === AlertSeverity.CRITICAL ? 0 : 
            alert.severity === AlertSeverity.HIGH ? 10000 :
            alert.severity === AlertSeverity.MEDIUM ? 8000 : 6000
          }
          className={cn(
            'animate-in slide-in-from-right duration-300',
            `animation-delay-${index * 100}`
          )}
        />
      ))}
      
      {alerts.length > maxToasts && (
        <div className="text-center">
          <Badge variant="secondary" className="text-xs">
            +{alerts.length - maxToasts} more alerts
          </Badge>
        </div>
      )}
    </div>
  );
};

export default AlertToast;