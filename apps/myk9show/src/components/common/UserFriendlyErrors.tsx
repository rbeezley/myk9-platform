// User-friendly error messages and recovery suggestions
// Phase 3.3: Enhanced Error Handling & Recovery

import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, WifiOff, Shield, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { type StructuredError, ErrorClassifier } from '@/lib/errorMonitoring';
import { useConnectionRecovery } from '@/lib/connectionRecovery';
import { useOfflineFirst } from '@/lib/offlineHandler';

// Error display component props
interface ErrorDisplayProps {
  error: Error | StructuredError;
  onRetry?: () => void;
  onDismiss?: () => void;
  showDetails?: boolean;
  compact?: boolean;
}

// Error toast notification props
interface ErrorToastProps {
  error: StructuredError;
  duration?: number;
  showRecovery?: boolean;
}

// Main error display component
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  showDetails = false,
  compact = false,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { connectionStatus } = useConnectionRecovery();
  const { networkStatus } = useOfflineFirst();

  // Convert Error to StructuredError if needed
  const structuredError: StructuredError = 'severity' in error
    ? error as StructuredError
    : {
        id: `error_${Date.now()}`,
        message: error.message,
        ...(error.stack !== undefined && { stack: error.stack }),
        context: {
          sessionId: 'current',
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: Date.now(),
        },
        ...ErrorClassifier.classifyError(error),
      };

  const handleRetry = async () => {
    if (!onRetry) return;
    
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const getErrorIcon = () => {
    switch (structuredError.category) {
      case 'network':
        return WifiOff;
      case 'authentication':
      case 'authorization':
        return Shield;
      default:
        return AlertTriangle;
    }
  };

  const getSeverityVariant = (): 'default' | 'destructive' => {
    switch (structuredError.severity) {
      case 'critical':
      case 'high':
        return 'destructive';
      case 'medium':
      case 'low':
      default:
        return 'default';
    }
  };

  const getBadgeVariant = (): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (structuredError.severity) {
      case 'critical':
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getAlertIcon = () => {
    switch (structuredError.severity) {
      case 'critical':
        return XCircle;
      case 'high':
        return AlertTriangle;
      case 'medium':
        return AlertCircle;
      case 'low':
        return Info;
      default:
        return AlertCircle;
    }
  };

  if (compact) {
    const AlertIcon = getAlertIcon();
    
    return (
      <Alert variant={getSeverityVariant()} className="mb-4">
        <AlertIcon className="h-4 w-4" />
        <AlertTitle>
          {structuredError.category === 'network' && !networkStatus.isOnline
            ? 'You are offline'
            : 'Error occurred'
          }
        </AlertTitle>
        <AlertDescription className="flex justify-between items-center">
          <span>{structuredError.resolution?.suggested || structuredError.message}</span>
          <div className="flex gap-2 ml-4">
            {structuredError.retryable && onRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={isRetrying}
                className="h-7"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
                Retry
              </Button>
            )}
            {onDismiss && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                className="h-7"
              >
                Dismiss
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const ErrorIcon = getErrorIcon();

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <ErrorIcon className="h-6 w-6 text-destructive" />
          <div className="flex-1">
            <CardTitle className="text-lg">
              {structuredError.category === 'network' && !networkStatus.isOnline
                ? 'Connection Problem'
                : 'Error Occurred'
              }
            </CardTitle>
            <CardDescription>
              {structuredError.resolution?.suggested || structuredError.message}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getBadgeVariant()}>
              {structuredError.severity}
            </Badge>
            {!networkStatus.isOnline && (
              <Badge variant="destructive">Offline</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connection Status */}
        {structuredError.category === 'network' && (
          <Alert>
            <WifiOff className="h-4 w-4" />
            <AlertTitle>Network Status</AlertTitle>
            <AlertDescription>
              {!networkStatus.isOnline 
                ? 'You are currently offline. Your changes will be saved and synced when connection is restored.'
                : connectionStatus.isRecovering
                ? 'Attempting to restore connection...'
                : `Connection quality: ${connectionStatus.connectionQuality}`
              }
            </AlertDescription>
          </Alert>
        )}

        {/* Recovery Steps */}
        {structuredError.resolution?.steps && (
          <div>
            <h4 className="font-medium mb-3">Recovery Steps</h4>
            <ol className="space-y-2">
              {structuredError.resolution.steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="text-sm">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {structuredError.retryable && onRetry && (
            <Button 
              onClick={handleRetry}
              disabled={isRetrying || !networkStatus.isOnline}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying...' : 'Try Again'}
            </Button>
          )}
          
          <Button 
            variant="outline" 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Page
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => window.location.href = '/'}
            className="flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Button>

          {onDismiss && (
            <Button 
              variant="ghost"
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          )}
        </div>

        {/* Technical Details */}
        {showDetails && (
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <Bug className="h-4 w-4" />
              Technical Details
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 p-4 bg-muted rounded-lg">
              <div className="space-y-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Error ID:</span> {structuredError.id}
                </div>
                <div>
                  <span className="text-muted-foreground">Category:</span> {structuredError.category}
                </div>
                <div>
                  <span className="text-muted-foreground">User Impact:</span> {structuredError.userImpact}
                </div>
                <div>
                  <span className="text-muted-foreground">Timestamp:</span> {new Date(structuredError.context.timestamp).toISOString()}
                </div>
                <div>
                  <span className="text-muted-foreground">URL:</span> {structuredError.context.url}
                </div>
                {structuredError.stack && (
                  <div className="mt-3">
                    <span className="text-muted-foreground">Stack Trace:</span>
                    <pre className="text-xs mt-1 max-h-32 overflow-auto">
                      {structuredError.stack}
                    </pre>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};

// Error toast notification component
export const ErrorToast: React.FC<ErrorToastProps> = ({
  error,
  duration = 5000,
  showRecovery = true,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const getTitle = () => {
      switch (error.category) {
        case 'network':
          return 'Connection Error';
        case 'validation':
          return 'Validation Error';
        case 'authentication':
          return 'Authentication Error';
        case 'authorization':
          return 'Permission Error';
        default:
          return 'Error';
      }
    };

    const isError = error.severity === 'critical' || error.severity === 'high';
    
    if (isError) {
      toast.error(getTitle(), {
        description: error.resolution?.suggested || error.message,
        duration,
        action: showRecovery && error.retryable ? {
          label: 'Retry',
          onClick: async () => {
            setIsRetrying(true);
            // Retry logic would go here
            setTimeout(() => setIsRetrying(false), 1000);
          },
        } : undefined,
      });
    } else {
      toast(getTitle(), {
        description: error.resolution?.suggested || error.message,
        duration,
        action: showRecovery && error.retryable ? {
          label: 'Retry',
          onClick: async () => {
            setIsRetrying(true);
            // Retry logic would go here
            setTimeout(() => setIsRetrying(false), 1000);
          },
        } : undefined,
      });
    }
  }, [error, duration, showRecovery, isRetrying]);

  return null;
};

// Success message component
export const SuccessMessage: React.FC<{
  message: string;
  description?: string;
  onDismiss?: () => void;
  compact?: boolean;
}> = ({ message, description, onDismiss, compact = false }) => {
  if (compact) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="flex justify-between items-center text-green-800">
          <span>{message}</span>
          {onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="h-7 text-green-700 hover:text-green-900"
            >
              Dismiss
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <CheckCircle className="h-6 w-6 text-green-600" />
          <div className="flex-1">
            <CardTitle className="text-lg text-green-800">{message}</CardTitle>
            {description && (
              <CardDescription className="text-green-700">
                {description}
              </CardDescription>
            )}
          </div>
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="text-green-700 hover:text-green-900"
            >
              Dismiss
            </Button>
          )}
        </div>
      </CardHeader>
    </Card>
  );
};

// useUserFriendlyErrors hook has been extracted to @/hooks/useUserFriendlyErrors.ts
// to fix react-refresh warning (hooks must be in their own files)
// Import it from '@/hooks/useUserFriendlyErrors' directly.