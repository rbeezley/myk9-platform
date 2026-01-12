import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { logger } from '@/services/LoggingService';
import {
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  Activity,
  RefreshCw,
  Info
} from 'lucide-react';
import { RealtimeConnectionManager, ConnectionState, ConnectionMetrics } from '@/services/realtime/RealtimeConnectionManager';
import { cn } from '@/lib/utils';

interface RealtimeConnectionStatusProps {
  showDetailed?: boolean;
  className?: string;
}

export function RealtimeConnectionStatus({ 
  showDetailed = false, 
  className 
}: RealtimeConnectionStatusProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>();
  const [metrics, setMetrics] = useState<ConnectionMetrics>();
  const [isReconnecting, setIsReconnecting] = useState(false);

  const connectionManager = RealtimeConnectionManager.getInstance();

  useEffect(() => {
    // Get initial state
    setConnectionState(connectionManager.getConnectionState());
    setMetrics(connectionManager.getConnectionMetrics());

    // Subscribe to connection state changes
    const handleStateChange = (data: unknown) => {
      const newState = data as ConnectionState;
      setConnectionState(newState);
      setMetrics(connectionManager.getConnectionMetrics());
    };
    const unsubscribe = connectionManager.addConnectionListener('state-change', handleStateChange);

    // Update metrics periodically
    const metricsInterval = setInterval(() => {
      setMetrics(connectionManager.getConnectionMetrics());
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(metricsInterval);
    };
  }, [connectionManager]);

  const handleForceReconnect = async () => {
    setIsReconnecting(true);
    try {
      await connectionManager.forceReconnect();
    } catch (error) {
      logger.error('Force reconnect failed:', 'scoring', {}, error as Error);
    } finally {
      setIsReconnecting(false);
    }
  };

  const getStatusIcon = () => {
    if (isReconnecting) {
      return <RefreshCw className="h-4 w-4 animate-spin" />;
    }

    switch (connectionState?.status) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'connecting':
        return <RefreshCw className="h-4 w-4 animate-spin text-yellow-500" />;
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-orange-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <WifiOff className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (connectionState?.status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-orange-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    if (isReconnecting) return 'Reconnecting...';
    
    switch (connectionState?.status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  const formatUptime = (uptime: number) => {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatTime = (ms: number) => {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  if (!showDetailed) {
    // Compact status indicator
    return (
      <div className={cn("flex items-center space-x-2", className)}>
        <div className="relative">
          {getStatusIcon()}
          <div className={cn(
            "absolute -top-1 -right-1 w-2 h-2 rounded-full",
            getStatusColor()
          )} />
        </div>
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>
    );
  }

  // Detailed status card
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <span>Real-time Connection</span>
          </div>
          
          {connectionState?.status !== 'connected' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleForceReconnect}
              disabled={isReconnecting}
            >
              {isReconnecting ? (
                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
              ) : (
                'Reconnect'
              )}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge 
            variant={connectionState?.status === 'connected' ? 'default' : 'secondary'}
            className="flex items-center space-x-1"
          >
            <div className={cn("w-2 h-2 rounded-full", getStatusColor())} />
            <span>{getStatusText()}</span>
          </Badge>
        </div>

        {/* Last Connected */}
        {connectionState?.lastConnected && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Last Connected</span>
            <span className="text-sm">
              {connectionState.lastConnected.toLocaleTimeString()}
            </span>
          </div>
        )}

        {/* Connection Uptime */}
        {metrics && connectionState?.status === 'connected' && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Uptime</span>
            <span className="text-sm">{formatUptime(metrics.connectionUptime)}</span>
          </div>
        )}

        {/* Reconnect Attempts */}
        {connectionState && connectionState.reconnectAttempts && connectionState.reconnectAttempts > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Reconnect Attempts</span>
              <span className="text-sm">{connectionState?.reconnectAttempts}</span>
            </div>
            <Progress 
              value={(connectionState?.reconnectAttempts || 0) / 10 * 100} 
              className="h-1"
            />
          </div>
        )}

        {/* Error Message */}
        {connectionState?.error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Connection Error</p>
                <p className="text-xs text-red-600">{connectionState.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Connection Metrics */}
        {metrics && (
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Activity className="h-3 w-3" />
              <span>Connection Metrics</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Connections</span>
                  <span>{metrics.totalConnections}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Disconnections</span>
                  <span>{metrics.totalDisconnections}</span>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Reconnect</span>
                  <span>{formatTime(metrics.averageReconnectTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Reconnect</span>
                  <span>{formatTime(metrics.lastReconnectTime)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connection Quality Indicator */}
        {metrics && connectionState?.status === 'connected' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Connection Quality</span>
              <div className="flex items-center space-x-1">
                {[1, 2, 3].map((level) => {
                  const isActive = getConnectionQuality(metrics) >= level;
                  return (
                    <div
                      key={level}
                      className={cn(
                        "w-1 h-3 rounded-full",
                        isActive ? 'bg-green-500' : 'bg-gray-300'
                      )}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="flex items-start space-x-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
          <Info className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-700">
            <p>Real-time features require an active connection for live scoring updates and judge collaboration.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper function to determine connection quality
function getConnectionQuality(metrics: ConnectionMetrics): number {
  const reconnectRatio = metrics.totalConnections > 0 ? 
    metrics.totalDisconnections / metrics.totalConnections : 0;
  
  const avgReconnectTime = metrics.averageReconnectTime;
  
  // Quality scoring (1-3 scale)
  if (reconnectRatio > 0.5 || avgReconnectTime > 10000) {
    return 1; // Poor
  } else if (reconnectRatio > 0.2 || avgReconnectTime > 5000) {
    return 2; // Good
  } else {
    return 3; // Excellent
  }
}