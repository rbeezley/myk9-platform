import React, { useState, useEffect } from 'react';
import { logger } from '@/services/LoggingService';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  ChevronDown,
  Clock,
  Filter,
  GitBranch,
  Info,
  MoreHorizontal,
  Settings,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ConflictNotification {
  id: string;
  type: 'conflict' | 'resolution' | 'escalation' | 'batch';
  title: string;
  description: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'unread' | 'read' | 'dismissed' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    conflictCount?: number;
    affectedUsers?: string[];
    autoResolvable?: boolean;
    deadline?: Date;
    escalationLevel?: number;
  };
  actions?: Array<{
    id: string;
    label: string;
    variant: 'default' | 'destructive' | 'outline';
    handler: () => void;
  }>;
}

interface ConflictNotificationCenterProps {
  notifications: ConflictNotification[];
  onNotificationAction: (notificationId: string, actionId: string) => void;
  onNotificationDismiss: (notificationId: string) => void;
  onNotificationRead: (notificationId: string) => void;
  onBulkAction: (notificationIds: string[], action: string) => void;
  onSettingsOpen?: () => void;
  maxHeight?: string;
}

type FilterType = 'all' | 'unread' | 'conflicts' | 'high-priority' | 'escalated';
type SortType = 'newest' | 'oldest' | 'priority' | 'entity';

export const ConflictNotificationCenter: React.FC<ConflictNotificationCenterProps> = ({
  notifications,
  onNotificationAction,
  onNotificationDismiss,
  onNotificationRead,
  onBulkAction,
  onSettingsOpen,
  maxHeight = "600px",
}) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('newest');
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [expandedNotification, setExpandedNotification] = useState<string | null>(null);

  // Auto-mark as read when opened
  useEffect(() => {
    const unreadNotifications = notifications.filter(n => n.status === 'unread');
    unreadNotifications.forEach(notification => {
      setTimeout(() => onNotificationRead(notification.id), 1000);
    });
  }, [notifications, onNotificationRead]);

  const filteredNotifications = notifications.filter(notification => {
    switch (filter) {
      case 'unread':
        return notification.status === 'unread';
      case 'conflicts':
        return notification.type === 'conflict';
      case 'high-priority':
        return ['high', 'critical'].includes(notification.priority);
      case 'escalated':
        return notification.type === 'escalation' || notification.metadata?.escalationLevel;
      default:
        return true;
    }
  });

  const sortedNotifications = [...filteredNotifications].sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.createdAt.getTime() - b.createdAt.getTime();
      case 'priority': {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      case 'entity':
        return a.entityType.localeCompare(b.entityType);
      default: // newest
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });

  const unreadCount = notifications.filter(n => n.status === 'unread').length;
  const criticalCount = notifications.filter(n => n.priority === 'critical').length;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-destructive border-destructive bg-destructive/10';
      case 'high':
        return 'text-warning border-warning bg-warning/10';
      case 'medium':
        return 'text-primary border-primary bg-primary/10';
      default:
        return 'text-muted-foreground border-border bg-muted/10';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'conflict':
        return AlertTriangle;
      case 'resolution':
        return Check;
      case 'escalation':
        return Zap;
      case 'batch':
        return GitBranch;
      default:
        return Info;
    }
  };

  const handleSelectNotification = (notificationId: string, checked: boolean) => {
    const newSelected = new Set(selectedNotifications);
    if (checked) {
      newSelected.add(notificationId);
    } else {
      newSelected.delete(notificationId);
    }
    setSelectedNotifications(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedNotifications.size === sortedNotifications.length) {
      setSelectedNotifications(new Set());
    } else {
      setSelectedNotifications(new Set(sortedNotifications.map(n => n.id)));
    }
  };

  const handleBulkDismiss = () => {
    onBulkAction(Array.from(selectedNotifications), 'dismiss');
    setSelectedNotifications(new Set());
  };

  const handleBulkMarkRead = () => {
    onBulkAction(Array.from(selectedNotifications), 'mark-read');
    setSelectedNotifications(new Set());
  };

  const toggleExpanded = (notificationId: string) => {
    setExpandedNotification(
      expandedNotification === notificationId ? null : notificationId
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full text-[10px] text-white flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </div>
              )}
            </div>
            <div>
              <CardTitle className="text-lg">Conflict Notifications</CardTitle>
              <CardDescription>
                {notifications.length} total • {unreadCount} unread
                {criticalCount > 0 && (
                  <span className="text-destructive font-medium">
                    {' '}• {criticalCount} critical
                  </span>
                )}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedNotifications.size > 0 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={handleBulkMarkRead}>
                  <Check className="h-4 w-4 mr-1" />
                  Mark Read
                </Button>
                <Button variant="outline" size="sm" onClick={handleBulkDismiss}>
                  <X className="h-4 w-4 mr-1" />
                  Dismiss
                </Button>
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-1" />
                  {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setFilter('all')}>
                  All Notifications
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter('unread')}>
                  Unread Only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter('conflicts')}>
                  Conflicts Only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter('high-priority')}>
                  High Priority
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter('escalated')}>
                  Escalated
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Clock className="h-4 w-4 mr-1" />
                  Sort
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSort('newest')}>
                  Newest First
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort('oldest')}>
                  Oldest First
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort('priority')}>
                  Priority
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort('entity')}>
                  Entity Type
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {onSettingsOpen && (
              <Button variant="outline" size="sm" onClick={onSettingsOpen}>
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {sortedNotifications.length > 0 && (
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={selectedNotifications.size === sortedNotifications.length}
              onChange={handleSelectAll}
              className="rounded"
            />
            <span className="text-sm text-muted-foreground">
              {selectedNotifications.size > 0
                ? `${selectedNotifications.size} selected`
                : 'Select all'
              }
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea style={{ maxHeight }}>
          {sortedNotifications.length > 0 ? (
            <div className="space-y-1 p-4 pt-0">
              {sortedNotifications.map((notification, index) => {
                const Icon = getTypeIcon(notification.type);
                const isExpanded = expandedNotification === notification.id;
                const isSelected = selectedNotifications.has(notification.id);

                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "border rounded-lg overflow-hidden transition-all duration-200",
                      notification.status === 'unread' && "bg-primary/5 border-primary/20",
                      notification.priority === 'critical' && "border-destructive/50",
                      isSelected && "ring-2 ring-primary/50"
                    )}
                  >
                    <div 
                      className="p-4 cursor-pointer hover:bg-muted/20"
                      onClick={() => toggleExpanded(notification.id)}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSelectNotification(notification.id, e.target.checked);
                          }}
                          className="mt-1 rounded"
                        />

                        <div className={cn(
                          'p-2 rounded-lg',
                          getPriorityColor(notification.priority)
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm truncate">
                                {notification.title}
                              </h4>
                              {notification.status === 'unread' && (
                                <div className="w-2 h-2 bg-primary rounded-full" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant="outline" className="text-xs">
                                {notification.priority}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onNotificationRead(notification.id);
                                    }}
                                  >
                                    <Check className="h-4 w-4 mr-2" />
                                    Mark as Read
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onNotificationDismiss(notification.id);
                                    }}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Dismiss
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {notification.description}
                          </p>

                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{notification.entityType}</span>
                            {notification.entityName && (
                              <>
                                <span>•</span>
                                <span className="truncate">{notification.entityName}</span>
                              </>
                            )}
                            {notification.metadata?.conflictCount && (
                              <>
                                <span>•</span>
                                <span>{notification.metadata.conflictCount} conflicts</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="border-t border-border/50"
                        >
                          <div className="p-4 space-y-4">
                            {/* Additional Details */}
                            {notification.metadata && (
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                {notification.metadata.affectedUsers && (
                                  <div>
                                    <span className="font-medium">Affected Users:</span>
                                    <div className="text-muted-foreground">
                                      {notification.metadata.affectedUsers.join(', ')}
                                    </div>
                                  </div>
                                )}
                                {notification.metadata.deadline && (
                                  <div>
                                    <span className="font-medium">Deadline:</span>
                                    <div className="text-muted-foreground">
                                      {notification.metadata.deadline.toLocaleString()}
                                    </div>
                                  </div>
                                )}
                                {notification.metadata.autoResolvable && (
                                  <div>
                                    <span className="font-medium">Auto-Resolvable:</span>
                                    <div className="text-success">Yes</div>
                                  </div>
                                )}
                                {notification.metadata.escalationLevel && (
                                  <div>
                                    <span className="font-medium">Escalation Level:</span>
                                    <div className="text-warning">
                                      Level {notification.metadata.escalationLevel}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Action Buttons */}
                            {notification.actions && notification.actions.length > 0 && (
                              <div className="flex items-center gap-2 pt-2 border-t">
                                {notification.actions.map((action) => (
                                  <Button
                                    key={action.id}
                                    variant={action.variant}
                                    size="sm"
                                    onClick={() => {
                                      onNotificationAction(notification.id, action.id);
                                      action.handler();
                                    }}
                                  >
                                    {action.label}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <BellRing className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-2">No notifications</h3>
              <p className="text-sm text-muted-foreground">
                {filter === 'all' 
                  ? "You're all caught up! No conflicts to resolve."
                  : `No notifications match the current filter: ${filter}`
                }
              </p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};