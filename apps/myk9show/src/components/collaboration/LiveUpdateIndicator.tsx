import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { LiveUpdate, collaborationHub } from '@/services/collaboration/CollaborationHubService';
import { 
import { logger } from '@/services/LoggingService';
  Activity, 
  Plus, 
  Edit, 
  Trash2, 
  RefreshCw, 
  Users, 
  Dog, 
  User, 
  Building, 
  Trophy,
  Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface LiveUpdateIndicatorProps {
  entityType?: string;
  entityId?: string;
  showId?: string;
  className?: string;
  maxVisible?: number;
}

const entityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  show: Trophy,
  dog: Dog,
  person: User,
  club: Building,
  entry: Users,
  class: Activity,
  score: RefreshCw
};

const actionIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  created: Plus,
  updated: Edit,
  deleted: Trash2,
  status_changed: RefreshCw
};

const actionColors: Record<string, string> = {
  created: 'bg-green-100 text-green-800 border-green-200',
  updated: 'bg-blue-100 text-blue-800 border-blue-200',
  deleted: 'bg-red-100 text-red-800 border-red-200',
  status_changed: 'bg-yellow-100 text-yellow-800 border-yellow-200'
};

const priorityColors: Record<string, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-green-500'
};

export const LiveUpdateIndicator: React.FC<LiveUpdateIndicatorProps> = ({
  entityType,
  entityId,
  showId,
  className = '',
  maxVisible = 5
}) => {
  const [updates, setUpdates] = useState<LiveUpdate[]>([]);
  const [recentCount, setRecentCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const handleUpdate = useCallback((update: LiveUpdate) => {
    setUpdates(prev => {
      const newUpdates = [update, ...prev].slice(0, 50); // Keep last 50 updates
      return newUpdates;
    });

    // Count recent updates (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    setRecentCount(() => {
      const recent = updates.filter(u => u.timestamp > fiveMinutesAgo).length + 1;
      return recent;
    });

    // Auto-hide the recent count after 10 seconds
    setTimeout(() => {
      setRecentCount(prev => Math.max(0, prev - 1));
    }, 10000);
  }, [updates]);

  useEffect(() => {
    const subscriptions: string[] = [];

    // Subscribe to relevant updates
    if (entityType && entityId) {
      const sub = collaborationHub.subscribeToEntityUpdates(
        entityType,
        entityId,
        handleUpdate,
        showId
      );
      subscriptions.push(sub);
    } else if (showId) {
      const sub = collaborationHub.subscribeToShowUpdates(showId, handleUpdate);
      subscriptions.push(sub);
    }

    // Load initial updates
    loadInitialUpdates();

    return () => {
      // Note: collaborationHub would need an unsubscribe method
      // For now, we'll rely on cleanup when the component unmounts
      // Cleanup subscriptions would go here
    };
  }, [entityType, entityId, showId, handleUpdate]);

  const loadInitialUpdates = () => {
    // In a real implementation, this would load recent updates from the backend
    // For now, we'll start with an empty array
    setUpdates([]);
  };

  const formatUpdateMessage = (update: LiveUpdate): string => {
    const entityName = update.entityType.charAt(0).toUpperCase() + update.entityType.slice(1);
    const action = update.action.replace('_', ' ');
    
    if (update.data && update.data.count !== undefined) {
      return `Entry count updated to ${update.data.count}`;
    }
    
    if (update.action === 'status_changed' && update.data?.status) {
      return `Status changed to ${update.data.status}`;
    }
    
    return `${entityName} ${action}`;
  };

  const getUpdatePriority = (update: LiveUpdate): 'high' | 'medium' | 'low' => {
    if (update.action === 'deleted') return 'high';
    if (update.action === 'status_changed') return 'medium';
    if (update.entityType === 'score') return 'high';
    return 'low';
  };

  const renderUpdate = (update: LiveUpdate, index: number) => {
    void index; // Suppress unused variable warning
    const EntityIcon = entityIcons[update.entityType] || Activity;
    const ActionIcon = actionIcons[update.action] || Edit;
    const priority = getUpdatePriority(update);

    return (
      <div
        key={update.id}
        className={cn(
          'flex items-start gap-3 p-3 border-l-2 hover:bg-muted/50 transition-colors',
          priorityColors[priority]
        )}
      >
        <div className="flex items-center gap-2 mt-1">
          <div className="p-1 rounded-md bg-muted">
            <EntityIcon className="w-3 h-3" />
          </div>
          <div className={cn(
            'p-1 rounded-md',
            actionColors[update.action] || 'bg-gray-100 text-gray-800'
          )}>
            <ActionIcon className="w-3 h-3" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium truncate">
              {formatUpdateMessage(update)}
            </p>
            <Badge variant="outline" className="text-xs shrink-0">
              {update.action.replace('_', ' ')}
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{update.userName}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(update.timestamp)} ago
            </span>
          </div>

          {update.data && Object.keys(update.data).length > 0 && (
            <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
              <pre className="text-muted-foreground overflow-x-auto">
                {JSON.stringify(update.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (updates.length === 0 && recentCount === 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="relative h-8 px-2"
          >
            <Activity className="w-4 h-4" />
            {recentCount > 0 && (
              <Badge
                variant="secondary"
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-blue-500 text-white"
              >
                {recentCount > 9 ? '9+' : recentCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end">
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Live Updates
                {updates.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {updates.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <ScrollArea className="h-80">
                {updates.length > 0 ? (
                  <div className="divide-y">
                    {updates.slice(0, maxVisible).map((update, index) => renderUpdate(update, index))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Activity className="w-8 h-8 text-muted-foreground opacity-50 mb-2" />
                    <p className="text-sm text-muted-foreground">No recent updates</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Live updates will appear here as they happen
                    </p>
                  </div>
                )}
              </ScrollArea>
              
              {updates.length > maxVisible && (
                <div className="p-3 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      // In a real app, this would show a full updates page
                      logger.debug('Show all updates', 'components', {});
                    }}
                  >
                    View all {updates.length} updates
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </PopoverContent>
      </Popover>

      {/* Recent activity pulse indicator */}
      {recentCount > 0 && (
        <div className="ml-2 flex items-center">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
            <div className="w-2 h-2 bg-blue-300 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveUpdateIndicator;