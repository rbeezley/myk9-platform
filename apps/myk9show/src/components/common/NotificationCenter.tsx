import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  enhancedNotificationService, 
  EnhancedNotification, 
  NotificationCategory, 
  NotificationPriority,
  NotificationPreferences
} from '@/services/EnhancedNotificationService';
import { useAuthContext } from '@/hooks/useAuthContext';
import { 
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Archive,
  Settings,
  Filter,
  Calendar,
  DollarSign,
  AlertTriangle,
  Clock,
  Trophy,
  Megaphone,
  User,
  Trash2,
  ExternalLink
} from 'lucide-react';

interface NotificationCenterProps {
  className?: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ className = "" }) => {
  const { user } = useAuthContext();
  const [notifications, setNotifications] = useState<EnhancedNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory | 'all'>('all');
  const [selectedPriority, setSelectedPriority] = useState<NotificationPriority | 'all'>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      const result = await enhancedNotificationService.getUserNotifications(user.id, {
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        priority: selectedPriority === 'all' ? undefined : selectedPriority,
        unreadOnly: showUnreadOnly,
        limit: 50
      });
      setNotifications(result.notifications);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, selectedCategory, selectedPriority, showUnreadOnly]);

  const loadUnreadCount = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const count = await enhancedNotificationService.getUnreadCount(user.id);
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  }, [user?.id]);

  const loadPreferences = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const prefs = await enhancedNotificationService.getUserPreferences(user.id);
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      loadNotifications();
      loadPreferences();
      loadUnreadCount();
    }
  }, [user?.id, selectedCategory, selectedPriority, showUnreadOnly, loadNotifications, loadPreferences, loadUnreadCount]);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!user?.id) return;
    
    await enhancedNotificationService.markAsRead(notificationId, user.id);
    loadNotifications();
    loadUnreadCount();
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;
    
    await enhancedNotificationService.markAllAsRead(
      user.id, 
      selectedCategory === 'all' ? undefined : selectedCategory
    );
    loadNotifications();
    loadUnreadCount();
  };

  const handleArchive = async (notificationId: string) => {
    if (!user?.id) return;
    
    await enhancedNotificationService.archiveNotification(notificationId, user.id);
    loadNotifications();
  };

  const handleDelete = async (notificationId: string) => {
    if (!user?.id) return;
    
    await enhancedNotificationService.deleteNotification(notificationId, user.id);
    loadNotifications();
    loadUnreadCount();
  };

  const handlePreferenceChange = async (updates: Partial<NotificationPreferences>) => {
    if (!user?.id || !preferences) return;
    
    await enhancedNotificationService.updatePreferences(user.id, updates);
    setPreferences({ ...preferences, ...updates });
  };

  const getCategoryIcon = (category: NotificationCategory) => {
    switch (category) {
      case NotificationCategory.ENTRY_UPDATE:
        return <User className="h-4 w-4" />;
      case NotificationCategory.PAYMENT_UPDATE:
        return <DollarSign className="h-4 w-4" />;
      case NotificationCategory.SCHEDULE_CHANGE:
        return <Calendar className="h-4 w-4" />;
      case NotificationCategory.SYSTEM_ALERT:
        return <AlertTriangle className="h-4 w-4" />;
      case NotificationCategory.JUDGE_ASSIGNMENT:
        return <User className="h-4 w-4" />;
      case NotificationCategory.RESULTS_POSTED:
        return <Trophy className="h-4 w-4" />;
      case NotificationCategory.REMINDER:
        return <Clock className="h-4 w-4" />;
      case NotificationCategory.ANNOUNCEMENT:
        return <Megaphone className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: NotificationPriority) => {
    switch (priority) {
      case NotificationPriority.URGENT:
        return 'bg-red-100 text-red-800 border-red-200';
      case NotificationPriority.HIGH:
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case NotificationPriority.NORMAL:
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case NotificationPriority.LOW:
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={className}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-96 p-0" align="end">
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Notifications
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {unreadCount} new
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                  {notifications.some(n => !n.isRead) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleMarkAllAsRead}
                    >
                      <CheckCheck className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {showSettings && preferences && (
              <CardContent className="border-t bg-muted/30 py-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Quiet Hours</Label>
                    <Switch
                      checked={preferences.quietHours.enabled}
                      onCheckedChange={(enabled) => 
                        handlePreferenceChange({
                          quietHours: { ...preferences.quietHours, enabled }
                        })
                      }
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Email Digest</Label>
                    <Switch
                      checked={preferences.digest.enabled}
                      onCheckedChange={(enabled) => 
                        handlePreferenceChange({
                          digest: { ...preferences.digest, enabled }
                        })
                      }
                    />
                  </div>
                </div>
              </CardContent>
            )}

            <CardContent className="p-0">
              {/* Filters */}
              <div className="p-3 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <Select 
                    value={selectedCategory} 
                    onValueChange={(value) => setSelectedCategory(value as NotificationCategory | 'all')}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value={NotificationCategory.ENTRY_UPDATE}>Entry Updates</SelectItem>
                      <SelectItem value={NotificationCategory.PAYMENT_UPDATE}>Payments</SelectItem>
                      <SelectItem value={NotificationCategory.SCHEDULE_CHANGE}>Schedule</SelectItem>
                      <SelectItem value={NotificationCategory.SYSTEM_ALERT}>Alerts</SelectItem>
                      <SelectItem value={NotificationCategory.REMINDER}>Reminders</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select 
                    value={selectedPriority} 
                    onValueChange={(value) => setSelectedPriority(value as NotificationPriority | 'all')}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value={NotificationPriority.URGENT}>Urgent</SelectItem>
                      <SelectItem value={NotificationPriority.HIGH}>High</SelectItem>
                      <SelectItem value={NotificationPriority.NORMAL}>Normal</SelectItem>
                      <SelectItem value={NotificationPriority.LOW}>Low</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                    className={`h-7 text-xs ${showUnreadOnly ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    <Filter className="h-3 w-3 mr-1" />
                    Unread
                  </Button>
                </div>
              </div>

              {/* Notifications List */}
              <ScrollArea className="h-96">
                {isLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                    Loading...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <BellOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No notifications found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {notifications.map((notification) => (
                      <div 
                        key={notification.id}
                        className={`p-3 hover:bg-muted/30 transition-colors ${
                          !notification.isRead ? 'bg-blue-50/50 border-l-2 border-l-blue-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex-shrink-0 p-1.5 rounded-full ${getPriorityColor(notification.priority)}`}>
                            {getCategoryIcon(notification.category)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="text-sm font-medium mb-1 line-clamp-1">
                                  {notification.title}
                                </h4>
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                  {notification.body}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {formatRelativeTime(notification.timestamp)}
                                  </span>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${getPriorityColor(notification.priority)}`}
                                  >
                                    {notification.priority}
                                  </Badge>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1 ml-2">
                                {!notification.isRead && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMarkAsRead(notification.id)}
                                    className="h-6 w-6 p-0"
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                )}
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleArchive(notification.id)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Archive className="h-3 w-3" />
                                </Button>
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(notification.id)}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            
                            {notification.actionUrl && (
                              <div className="mt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-xs"
                                  onClick={() => {
                                    window.open(notification.actionUrl, '_blank');
                                    if (!notification.isRead) {
                                      handleMarkAsRead(notification.id);
                                    }
                                  }}
                                >
                                  {notification.actionText || 'View'}
                                  <ExternalLink className="h-3 w-3 ml-1" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </PopoverContent>
      </Popover>
    </div>
  );
};