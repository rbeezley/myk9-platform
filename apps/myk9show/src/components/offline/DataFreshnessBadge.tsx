import React from 'react';
import { Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export type DataFreshness = 'fresh' | 'stale' | 'outdated' | 'offline';

interface DataFreshnessBadgeProps {
  lastUpdated?: Date;
  freshThreshold?: number; // minutes
  staleThreshold?: number; // minutes
  isOnline?: boolean;
  className?: string;
  showLabel?: boolean;
}

export const DataFreshnessBadge: React.FC<DataFreshnessBadgeProps> = ({
  lastUpdated,
  freshThreshold = 5,
  staleThreshold = 60,
  isOnline = true,
  className = '',
  showLabel = false
}) => {
  const getFreshness = (): DataFreshness => {
    if (!isOnline) return 'offline';
    if (!lastUpdated) return 'outdated';
    
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60));
    
    if (diffInMinutes <= freshThreshold) return 'fresh';
    if (diffInMinutes <= staleThreshold) return 'stale';
    return 'outdated';
  };

  const freshness = getFreshness();

  const getConfig = () => {
    switch (freshness) {
      case 'fresh':
        return {
          icon: CheckCircle,
          label: 'Fresh',
          variant: 'default' as const,
          className: 'bg-success-green/10 text-success-green border-success-green/20',
          tooltip: 'Data is up to date'
        };
      case 'stale':
        return {
          icon: Clock,
          label: 'Stale',
          variant: 'secondary' as const,
          className: 'bg-warning-orange/10 text-warning-orange border-warning-orange/20',
          tooltip: 'Data may be outdated'
        };
      case 'outdated':
        return {
          icon: AlertTriangle,
          label: 'Outdated',
          variant: 'destructive' as const,
          className: 'bg-error-red/10 text-error-red border-error-red/20',
          tooltip: 'Data is significantly outdated'
        };
      case 'offline':
        return {
          icon: XCircle,
          label: 'Offline',
          variant: 'outline' as const,
          className: 'bg-muted/50 text-muted-foreground border-muted',
          tooltip: 'Working offline'
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Never updated';
    
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just updated';
    if (diffInMinutes < 60) return `Updated ${diffInMinutes}m ago`;
    if (diffInMinutes < 24 * 60) return `Updated ${Math.floor(diffInMinutes / 60)}h ago`;
    return `Updated ${lastUpdated.toLocaleDateString()}`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={config.variant}
            className={`${config.className} ${className} cursor-help`}
          >
            <Icon className="h-3 w-3 mr-1" />
            {showLabel && config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <div className="font-medium">{config.tooltip}</div>
            <div className="text-xs opacity-80 mt-1">
              {formatLastUpdated()}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};