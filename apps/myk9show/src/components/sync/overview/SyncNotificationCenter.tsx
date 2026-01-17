import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bell, 
  Check, 
  X, 
  AlertTriangle, 
  Info, 
  CheckCircle2,
  XCircle,
  Clock,
  MoreHorizontal,
  Filter,
  Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { useSyncStore } from '@/store/syncStore';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface SyncNotification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionable: boolean;
  metadata?: Record<string, unknown>;
}

interface SyncNotificationCenterProps {
  className?: string;
}

export const SyncNotificationCenter: React.FC<SyncNotificationCenterProps> = ({ className }) => {
  const { operations, conflicts } = useSyncStore();
  const [notifications, setNotifications] = useState<SyncNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'errors'>('all');

  // Track operations and conflicts to generate notifications using render-time sync
  const operationsKey = operations.map(op => `${op.id}-${op.status}`).join(',');
  const conflictsKey = conflicts.map(c => c.id).join(',');
  const syncKey = `${operationsKey}-${conflictsKey}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);

  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    const newNotifications: SyncNotification[] = [];

    // Add notifications for completed operations
    operations.forEach(op => {
      if (op.status === 'completed' || op.status === 'error') {
        const existing = notifications.find(n => n.id === `op-${op.id}`);
        if (!existing) {
          newNotifications.push({
            id: `op-${op.id}`,
            type: op.status === 'completed' ? 'success' : 'error',
            title: op.status === 'completed' ? 'Sync Completed' : 'Sync Failed',
            message: `${(op as { type?: string }).type || 'Unknown'} operation ${op.status === 'completed' ? 'completed successfully' : 'failed'}`,
            timestamp: new Date((op as { updatedAt?: string | Date }).updatedAt || new Date()),
            read: false,
            actionable: op.status === 'error',
            metadata: { operation: op }
          });
        }
      }
    });

    // Add notifications for conflicts
    conflicts.forEach(conflict => {
      const existing = notifications.find(n => n.id === `conflict-${conflict.id}`);
      if (!existing) {
        newNotifications.push({
          id: `conflict-${conflict.id}`,
          type: 'warning',
          title: 'Sync Conflict Detected',
          message: `Conflict in ${(conflict as { entityType?: string }).entityType || 'Unknown'}: ${(conflict as { field?: string }).field || 'Unknown'}`,
          timestamp: new Date((conflict as { detectedAt?: string | Date }).detectedAt || new Date()),
          read: false,
          actionable: true,
          metadata: { conflict }
        });
      }
    });

    if (newNotifications.length > 0) {
      setNotifications(prev => [...newNotifications, ...prev].slice(0, 50)); // Keep last 50
    }
  }

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'unread') return !notification.read;
    if (filter === 'errors') return notification.type === 'error';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const getNotificationIcon = (type: SyncNotification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getNotificationBadgeColor = (type: SyncNotification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-700 border-red-500/20';
      case 'info':
        return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
    }
  };

  return (
    <Card className={cn("border-0 shadow-lg", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Sync Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="px-2 py-0.5 text-xs">
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-1" />
                  Filter
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40" align="end">
                <div className="space-y-1">
                  <Button
                    variant={filter === 'all' ? 'default' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setFilter('all')}
                  >
                    All
                  </Button>
                  <Button
                    variant={filter === 'unread' ? 'default' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setFilter('unread')}
                  >
                    Unread ({unreadCount})
                  </Button>
                  <Button
                    variant={filter === 'errors' ? 'default' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setFilter('errors')}
                  >
                    Errors
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={markAllAsRead} disabled={unreadCount === 0}>
                  <Check className="mr-2 h-4 w-4" />
                  Mark all as read
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearAll} disabled={notifications.length === 0}>
                  <Archive className="mr-2 h-4 w-4" />
                  Clear all
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <ScrollArea className="h-96">
          <div className="p-6 pt-0">
            <AnimatePresence>
              {filteredNotifications.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-8"
                >
                  <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">
                    {filter === 'all' ? 'No notifications' : 
                     filter === 'unread' ? 'No unread notifications' : 
                     'No error notifications'}
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-3">
                  {filteredNotifications.map((notification, index) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className={cn(
                        "p-4 rounded-lg border transition-all duration-200",
                        !notification.read ? "bg-card shadow-sm" : "bg-muted/30",
                        "hover:shadow-md hover:border-primary/20"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium">{notification.title}</h4>
                                {!notification.read && (
                                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                )}
                                <Badge 
                                  variant="outline" 
                                  className={cn("text-xs px-1.5", getNotificationBadgeColor(notification.type))}
                                >
                                  {notification.type}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{notification.message}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                              </div>
                            </div>
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {!notification.read && (
                                  <DropdownMenuItem onClick={() => markAsRead(notification.id)}>
                                    <Check className="mr-2 h-4 w-4" />
                                    Mark as read
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => removeNotification(notification.id)}>
                                  <X className="mr-2 h-4 w-4" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          
                          {notification.actionable && (
                            <div className="mt-3 flex gap-2">
                              <Button size="sm" variant="outline">
                                View Details
                              </Button>
                              {notification.type === 'warning' && (
                                <Button size="sm" variant="default">
                                  Resolve
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};