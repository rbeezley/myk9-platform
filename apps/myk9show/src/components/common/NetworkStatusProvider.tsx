import React, { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { WifiOff, Wifi, AlertCircle, RefreshCw } from 'lucide-react';
import { useOnlineStatus, useNetworkQuality } from '@/lib/networkUtils';
import { NetworkStatusContext, useNetworkStatus } from '@/hooks/useNetworkStatus';

interface NetworkStatusProviderProps {
  children: React.ReactNode;
}

export const NetworkStatusProvider: React.FC<NetworkStatusProviderProps> = ({ children }) => {
  const isOnline = useOnlineStatus();
  const quality = useNetworkQuality();
  const [showOfflineMessage, setShowOfflineMessage] = useState(!isOnline);
  const [hasBeenOffline, setHasBeenOffline] = useState(!isOnline);
  const [lastOnlineState, setLastOnlineState] = useState(isOnline);

  // Track when user goes offline/online - using state comparison during render
  if (isOnline !== lastOnlineState) {
    setLastOnlineState(isOnline);
    if (!isOnline) {
      setHasBeenOffline(true);
      setShowOfflineMessage(true);
    } else if (hasBeenOffline) {
      // User just came back online
      setShowOfflineMessage(false);
      // Could show a brief "Back online" message here
    }
  }

  const retryConnection = () => {
    // Force a connection test
    if (navigator.onLine) {
      setShowOfflineMessage(false);
    } else {
      // Still offline, keep showing message
      setShowOfflineMessage(true);
    }
  };

  const contextValue = {
    isOnline,
    quality,
    showOfflineMessage,
    retryConnection
  };

  return (
    <NetworkStatusContext.Provider value={contextValue}>
      {children}
      <NetworkStatusIndicator />
    </NetworkStatusContext.Provider>
  );
};

const NetworkStatusIndicator: React.FC = () => {
  const { isOnline, quality, showOfflineMessage, retryConnection } = useNetworkStatus();

  if (!showOfflineMessage && isOnline) {
    return null;
  }

  // Show offline alert
  if (!isOnline || showOfflineMessage) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
        <Alert className="border-orange-200 bg-orange-50">
          <WifiOff className="h-4 w-4 text-orange-600" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <div className="font-medium text-orange-800">No internet connection</div>
              <div className="text-sm text-orange-600">
                Changes will be saved locally and synced when connection is restored.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={retryConnection}
              className="ml-2 shrink-0"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Show slow connection warning
  if (quality && (quality.effectiveType === '2g' || quality.effectiveType === 'slow-2g')) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription>
            <div className="font-medium text-yellow-800">Slow connection detected</div>
            <div className="text-sm text-yellow-600">
              Some features may load slowly.
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
};

// Component for displaying network status in header/nav
export const NetworkStatusIcon: React.FC = () => {
  const { isOnline, quality } = useNetworkStatus();

  if (!isOnline) {
    return (
      <div className="flex items-center text-red-600" title="Offline">
        <WifiOff className="h-4 w-4" />
      </div>
    );
  }

  const getConnectionQuality = () => {
    if (!quality) return 'unknown';
    
    switch (quality.effectiveType) {
      case '4g':
        return 'excellent';
      case '3g':
        return 'good';
      case '2g':
        return 'poor';
      case 'slow-2g':
        return 'very-poor';
      default:
        return 'unknown';
    }
  };

  const connectionQuality = getConnectionQuality();
  const getColorClass = () => {
    switch (connectionQuality) {
      case 'excellent':
        return 'text-green-600';
      case 'good':
        return 'text-blue-600';
      case 'poor':
        return 'text-yellow-600';
      case 'very-poor':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getTitle = () => {
    if (!quality) return 'Online';
    return `Online - ${quality.effectiveType.toUpperCase()} (${quality.downlink} Mbps, ${quality.rtt}ms RTT)`;
  };

  return (
    <div className={`flex items-center ${getColorClass()}`} title={getTitle()}>
      <Wifi className="h-4 w-4" />
    </div>
  );
};