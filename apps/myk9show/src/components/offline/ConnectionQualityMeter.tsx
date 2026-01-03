import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, Signal, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

interface ConnectionInfo {
  isOnline: boolean;
  quality: ConnectionQuality;
  speed: number; // Mbps
  latency: number; // ms
  lastCheck: Date;
}

interface ConnectionQualityMeterProps {
  className?: string;
  showDetails?: boolean;
  onConnectionChange?: (info: ConnectionInfo) => void;
}

export const ConnectionQualityMeter: React.FC<ConnectionQualityMeterProps> = ({
  className = '',
  showDetails = false,
  onConnectionChange
}) => {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    isOnline: navigator.onLine,
    quality: 'offline',
    speed: 0,
    latency: 0,
    lastCheck: new Date()
  });

  const [isChecking, setIsChecking] = useState(false);

  const checkConnectionQuality = async (): Promise<ConnectionInfo> => {
    if (!navigator.onLine) {
      return {
        isOnline: false,
        quality: 'offline',
        speed: 0,
        latency: 0,
        lastCheck: new Date()
      };
    }

    try {
      // Simple connection test using a small image
      const startTime = performance.now();
      const response = await fetch('/favicon.ico?' + Date.now(), {
        method: 'GET',
        cache: 'no-cache'
      });
      const endTime = performance.now();
      
      const latency = endTime - startTime;
      
      // Estimate speed based on latency (rough approximation)
      let speed = 0;
      let quality: ConnectionQuality = 'poor';
      
      if (response.ok) {
        if (latency < 100) {
          quality = 'excellent';
          speed = 10; // Estimate 10+ Mbps
        } else if (latency < 300) {
          quality = 'good';
          speed = 5; // Estimate 5+ Mbps
        } else if (latency < 1000) {
          quality = 'fair';
          speed = 2; // Estimate 2+ Mbps
        } else {
          quality = 'poor';
          speed = 0.5; // Estimate < 1 Mbps
        }
      }

      return {
        isOnline: true,
        quality,
        speed,
        latency,
        lastCheck: new Date()
      };
    } catch {
      return {
        isOnline: false,
        quality: 'offline',
        speed: 0,
        latency: 0,
        lastCheck: new Date()
      };
    }
  };

  const updateConnectionInfo = useCallback(async () => {
    setIsChecking(true);
    try {
      const info = await checkConnectionQuality();
      setConnectionInfo(info);
      onConnectionChange?.(info);
    } finally {
      setIsChecking(false);
    }
  }, [onConnectionChange]);

  useEffect(() => {
    updateConnectionInfo();
    
    const interval = setInterval(updateConnectionInfo, 30000); // Check every 30 seconds
    
    const handleOnline = () => updateConnectionInfo();
    const handleOffline = () => updateConnectionInfo();
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onConnectionChange, updateConnectionInfo]);

  const getQualityConfig = () => {
    switch (connectionInfo.quality) {
      case 'excellent':
        return {
          icon: SignalHigh,
          color: 'text-success-green',
          bgColor: 'bg-success-green/10',
          borderColor: 'border-success-green/20',
          label: 'Excellent',
          description: 'Fast and stable connection'
        };
      case 'good':
        return {
          icon: SignalMedium,
          color: 'text-success-green',
          bgColor: 'bg-success-green/10',
          borderColor: 'border-success-green/20',
          label: 'Good',
          description: 'Reliable connection'
        };
      case 'fair':
        return {
          icon: SignalLow,
          color: 'text-warning-orange',
          bgColor: 'bg-warning-orange/10',
          borderColor: 'border-warning-orange/20',
          label: 'Fair',
          description: 'Slower connection'
        };
      case 'poor':
        return {
          icon: Signal,
          color: 'text-error-red',
          bgColor: 'bg-error-red/10',
          borderColor: 'border-error-red/20',
          label: 'Poor',
          description: 'Unstable connection'
        };
      case 'offline':
        return {
          icon: WifiOff,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/10',
          borderColor: 'border-muted',
          label: 'Offline',
          description: 'No internet connection'
        };
    }
  };

  const config = getQualityConfig();
  const Icon = config.icon;

  const formatSpeed = (speed: number) => {
    if (speed >= 1) return `${speed.toFixed(1)} Mbps`;
    return `${(speed * 1000).toFixed(0)} Kbps`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`inline-flex items-center gap-2 ${className}`}>
            <Badge
              variant="outline"
              className={`${config.bgColor} ${config.color} ${config.borderColor} cursor-help`}
            >
              <Icon className={`h-3 w-3 mr-1 ${isChecking ? 'animate-pulse' : ''}`} />
              {showDetails ? config.label : ''}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <div className="font-medium">{config.description}</div>
            {connectionInfo.isOnline && (
              <div className="text-xs opacity-80 mt-1 space-y-1">
                <div>Speed: ~{formatSpeed(connectionInfo.speed)}</div>
                <div>Latency: {connectionInfo.latency.toFixed(0)}ms</div>
                <div>Last check: {connectionInfo.lastCheck.toLocaleTimeString()}</div>
              </div>
            )}
            {!connectionInfo.isOnline && (
              <div className="text-xs opacity-80 mt-1">
                Working offline
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};