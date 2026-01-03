import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collaborationHub,
  UserPresence,
  LiveUpdate,
  NotificationEvent,
  CollaborationEvent,
  EditLock
} from '@/services/collaboration/CollaborationHubService';

// Hook for basic collaboration features
export const useCollaboration = (user?: Omit<UserPresence, 'lastSeen'>) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || isInitialized) return;

    const initialize = async () => {
      try {
        await collaborationHub.initialize(user);
        setIsInitialized(true);
        setIsConnected(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize collaboration');
        setIsConnected(false);
      }
    };

    initialize();

    return () => {
      if (isInitialized) {
        collaborationHub.cleanup();
        setIsInitialized(false);
        setIsConnected(false);
      }
    };
  }, [user, isInitialized]);

  const updateLocation = useCallback(async (page: string, entityId?: string, entityType?: 'show' | 'dog' | 'person' | 'club' | 'entry') => {
    if (!isInitialized) return;
    await collaborationHub.updateUserLocation(page, entityId, entityType);
  }, [isInitialized]);

  const updateActivity = useCallback(async (type: 'viewing' | 'editing' | 'scoring' | 'judging', details?: string) => {
    if (!isInitialized) return;
    await collaborationHub.updateUserActivity(type, details);
  }, [isInitialized]);

  const updateStatus = useCallback(async (status: 'online' | 'away' | 'busy') => {
    if (!isInitialized) return;
    await collaborationHub.updateUserStatus(status);
  }, [isInitialized]);

  return {
    isInitialized,
    isConnected,
    error,
    updateLocation,
    updateActivity,
    updateStatus
  };
};

// Hook for presence awareness
export const usePresence = (entityType?: string, entityId?: string) => {
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);
  const [stats, setStats] = useState({
    activeUsers: 0,
    onlineJudges: 0,
    onlineSecretaries: 0,
    onlineExhibitors: 0
  });

  useEffect(() => {
    const updatePresence = () => {
      let users: UserPresence[];
      
      if (entityType && entityId) {
        users = collaborationHub.getActiveUsersForEntity(entityType, entityId);
      } else {
        users = collaborationHub.getActiveUsers();
      }
      
      setActiveUsers(users);
      
      const currentStats = collaborationHub.getCollaborationStats();
      setStats({
        activeUsers: currentStats.activeUsers,
        onlineJudges: currentStats.onlineJudges,
        onlineSecretaries: currentStats.onlineSecretaries,
        onlineExhibitors: currentStats.onlineExhibitors
      });
    };

    updatePresence();

    const unsubscribe = collaborationHub.subscribe((event) => {
      if (event.type === 'presence') {
        updatePresence();
      }
    });

    const interval = setInterval(updatePresence, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [entityType, entityId]);

  const getUsersWithRole = useCallback((role: UserPresence['role']) => {
    return collaborationHub.getUsersWithRole(role);
  }, []);

  const isUserActive = useCallback((userId: string) => {
    return activeUsers.some(user => user.id === userId);
  }, [activeUsers]);

  return {
    activeUsers,
    stats,
    getUsersWithRole,
    isUserActive
  };
};

// Hook for live updates
export const useLiveUpdates = (
  entityType?: string, 
  entityId?: string, 
  showId?: string,
  onUpdate?: (update: LiveUpdate) => void
) => {
  const [updates, setUpdates] = useState<LiveUpdate[]>([]);
  const [recentCount, setRecentCount] = useState(0);
  const subscriptionRef = useRef<string | null>(null);

  useEffect(() => {
    const handleUpdate = (update: LiveUpdate) => {
      setUpdates(prev => [update, ...prev.slice(0, 49)]); // Keep last 50
      
      // Count recent updates (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      setRecentCount(() => {
        const recentUpdates = updates.filter(u => u.timestamp > fiveMinutesAgo);
        return recentUpdates.length + 1;
      });

      onUpdate?.(update);

      // Auto-decay recent count
      setTimeout(() => {
        setRecentCount(prev => Math.max(0, prev - 1));
      }, 300000); // 5 minutes
    };

    // Subscribe to appropriate updates
    if (entityType && entityId) {
      subscriptionRef.current = collaborationHub.subscribeToEntityUpdates(
        entityType,
        entityId,
        handleUpdate,
        showId
      );
    } else if (showId) {
      subscriptionRef.current = collaborationHub.subscribeToShowUpdates(showId, handleUpdate);
    }

    return () => {
      if (subscriptionRef.current) {
        // Note: Need to implement unsubscribe in collaboration hub
        subscriptionRef.current = null;
      }
    };
  }, [entityType, entityId, showId, onUpdate, updates]);

  const broadcastUpdate = useCallback(async () => {
    // Use collaboration hub to broadcast updates
    // This would be implemented based on the specific update type
  }, []);

  return {
    updates,
    recentCount,
    broadcastUpdate
  };
};

// Hook for collaborative editing
export const useCollaborativeEditing = (entityType: string, entityId: string) => {
  const [editLock, setEditLock] = useState<EditLock | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    const updateEditState = () => {
      const lock = collaborationHub.getEditLock(entityType, entityId);
      const locked = collaborationHub.isEntityLocked(entityType, entityId);
      
      setEditLock(lock);
      setIsLocked(locked);
      setCanEdit(!locked);
    };

    updateEditState();

    const unsubscribe = collaborationHub.subscribe((event) => {
      if (event.type === 'edit_lock') {
        updateEditState();
      }
    });

    const interval = setInterval(updateEditState, 10000); // Check every 10 seconds

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [entityType, entityId]);

  const requestEdit = useCallback(async (): Promise<boolean> => {
    const success = await collaborationHub.requestEditLock(entityType, entityId);
    if (success) {
      setCanEdit(true);
    }
    return success;
  }, [entityType, entityId]);

  const releaseEdit = useCallback(async () => {
    await collaborationHub.releaseEditLock(entityType, entityId);
    setCanEdit(false);
  }, [entityType, entityId]);

  const getTypingIndicators = useCallback((fieldName: string) => {
    return collaborationHub.getTypingIndicators(entityType, entityId, fieldName);
  }, [entityType, entityId]);

  return {
    editLock,
    isLocked,
    canEdit,
    requestEdit,
    releaseEdit,
    getTypingIndicators
  };
};

// Hook for notifications
export const useNotifications = () => {
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const updateNotifications = () => {
      const allNotifications = collaborationHub.getNotifications();
      const unread = collaborationHub.getUnreadNotifications();
      
      setNotifications(allNotifications);
      setUnreadCount(unread.length);
    };

    updateNotifications();

    const unsubscribe = collaborationHub.subscribeToNotifications((notification) => {
      setNotifications(prev => [notification, ...prev]);
      if (!notification.read) {
        setUnreadCount(prev => prev + 1);
      }
    });

    return unsubscribe;
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    await collaborationHub.markNotificationAsRead(notificationId);
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const sendNotification = useCallback(async (notification: Omit<NotificationEvent, 'id' | 'timestamp' | 'read'>) => {
    await collaborationHub.sendNotification(notification);
  }, []);

  return {
    notifications,
    unreadCount,
    markAsRead,
    sendNotification
  };
};

// Hook for collaboration events/activity feed
export const useCollaborationActivity = (limit = 20) => {
  const [events, setEvents] = useState<CollaborationEvent[]>([]);
  const [stats, setStats] = useState({
    activeUsers: 0,
    activeEdits: 0,
    recentUpdates: 0,
    notifications: 0
  });

  useEffect(() => {
    const updateActivity = () => {
      const eventHistory = collaborationHub.getEventHistory(limit);
      const currentStats = collaborationHub.getCollaborationStats();
      
      setEvents(eventHistory);
      setStats({
        activeUsers: currentStats.activeUsers,
        activeEdits: currentStats.activeEdits,
        recentUpdates: currentStats.recentUpdates,
        notifications: currentStats.notifications
      });
    };

    updateActivity();

    const unsubscribe = collaborationHub.subscribe((event) => {
      setEvents(prev => [event, ...prev.slice(0, limit - 1)]);
      updateActivity();
    });

    const interval = setInterval(updateActivity, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [limit]);

  return {
    events,
    stats
  };
};

// Hook for connection health monitoring
export const useCollaborationHealth = () => {
  const [isHealthy, setIsHealthy] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  useEffect(() => {
    const checkHealth = () => {
      const healthy = collaborationHub.isHealthy();
      setIsHealthy(healthy);
      setLastCheck(new Date());
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  return {
    isHealthy,
    lastCheck
  };
};