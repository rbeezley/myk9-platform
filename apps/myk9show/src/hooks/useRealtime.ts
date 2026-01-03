/**
 * Real-time React Hook
 * Phase 6.1: Real-time Infrastructure
 * 
 * React hook for managing real-time subscriptions, presence tracking,
 * and live data updates with automatic cleanup and error handling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { subscriptionManager } from '../services/realtime/subscriptionManager';
import { connectionManager } from '../services/realtime/connectionManager';
import type { 
  RealtimeEventCallback,
  SubscriptionConfig,
  SubscriptionMetrics,
  ConnectionState,
  ConnectionHealth,
  PresenceTrackingData,
  LiveScoringSession,
  BroadcastEvent
} from '../types/realtime-types';
import type { CheckInInfo, CheckInStatus } from '../types/check-in-types';

export interface UseRealtimeOptions {
  autoConnect?: boolean;
  enablePresence?: boolean;
  enableBroadcast?: boolean;
  retryOnFailure?: boolean;
  batchUpdates?: boolean;
  bufferTime?: number;
}

export interface RealtimeState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionHealth: ConnectionHealth;
  subscriptions: SubscriptionMetrics[];
  presenceCount: number;
  lastActivity: Date | null;
  errorCount: number;
}

export interface UseRealtimeReturn {
  // Connection state
  state: RealtimeState;
  connectionState: ConnectionState;
  
  // Subscription management
  subscribe: <T = unknown>(
    subscriptionId: string,
    config: SubscriptionConfig,
    callback: RealtimeEventCallback<T>
  ) => Promise<string>;
  unsubscribe: (subscriptionId: string) => Promise<void>;
  
  // Presence tracking
  trackPresence: (channelName: string, userData: PresenceTrackingData) => Promise<void>;
  untrackPresence: (channelName: string) => Promise<void>;
  subscribeToPresence: (
    channelName: string,
    callback: (presences: PresenceTrackingData[]) => void
  ) => Promise<string>;
  
  // Broadcasting
  broadcast: (channelName: string, event: BroadcastEvent) => Promise<void>;
  
  // Specialized subscriptions
  subscribeToScoringSession: (
    sessionId: string,
    callback: (session: LiveScoringSession) => void
  ) => Promise<string>;
  subscribeToCheckIns: (
    showId: string,
    callback: (checkIn: CheckInInfo) => void
  ) => Promise<string>;
  
  // Connection control
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  forceReconnect: () => Promise<void>;
  
  // Metrics and debugging
  getMetrics: () => SubscriptionMetrics[];
  getConnectionHealth: () => ConnectionHealth;
  
  // Error handling
  lastError: Error | null;
  clearError: () => void;
}

/**
 * Real-time hook for managing live data subscriptions and presence
 */
export const useRealtime = (options: UseRealtimeOptions = {}): UseRealtimeReturn => {
  const {
    autoConnect = true,
    enablePresence = false,
    enableBroadcast = false,
    retryOnFailure = true,
    batchUpdates = false,
    bufferTime = 500,
  } = options;

  // State management
  const [state, setState] = useState<RealtimeState>(() => ({
    isConnected: false,
    isConnecting: false,
    connectionHealth: {
      isConnected: false,
      connectionQuality: 'poor',
      latency: 0,
      packetLoss: 0,
    },
    subscriptions: [],
    presenceCount: 0,
    lastActivity: null,
    errorCount: 0,
  }));

  const [connectionState, setConnectionState] = useState<ConnectionState>(() => ({
    status: 'disconnected',
    lastConnected: null,
    reconnectAttempts: 0,
    error: null,
  }));

  const [lastError, setLastError] = useState<Error | null>(null);

  // Refs for cleanup and state tracking
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const presenceChannelsRef = useRef<Set<string>>(new Set());
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);

  /**
   * Update state from connection manager
   */
  const updateConnectionState = useCallback(() => {
    const connState = connectionManager.getConnectionState();
    const health = connectionManager.getConnectionHealth();
    const rawMetrics = subscriptionManager.getMetrics();
    
    // Convert subscription manager metrics to expected format
    const metricsArray = Array.isArray(rawMetrics) ? rawMetrics : [rawMetrics];
    const convertedMetrics: SubscriptionMetrics[] = metricsArray.map(m => ({
      subscriptions: 1,
      activeChannels: m.isActive ? 1 : 0,
      messagesReceived: m.messagesReceived || 0,
      messagesLost: 0,
      averageLatency: m.averageProcessingTime || 0
    }));

    setConnectionState(connState);
    setState(prev => ({
      ...prev,
      isConnected: connState.status === 'connected',
      isConnecting: connState.status === 'connecting',
      connectionHealth: health,
      subscriptions: convertedMetrics,
      lastActivity: metricsArray.length > 0 
        ? metricsArray[0]?.lastActivity || null 
        : null,
    }));
  }, []);

  /**
   * Subscribe to real-time updates
   */
  const subscribe = useCallback(async <T = unknown>(
    subscriptionId: string,
    config: SubscriptionConfig,
    callback: RealtimeEventCallback<T>
  ): Promise<string> => {
    try {
      // Convert to subscription manager config format
      const managerConfig = {
        table: config.table,
        filter: config.filter,
        events: config.events as Array<'INSERT' | 'UPDATE' | 'DELETE' | '*'>,
        enablePresence: enablePresence || config.enablePresence,
        enableBroadcast: enableBroadcast || config.enableBroadcast,
        batchUpdates: batchUpdates,
        bufferTime: bufferTime,
      };

      const id = await subscriptionManager.subscribe(
        subscriptionId,
        managerConfig,
        callback
      );

      subscriptionsRef.current.add(id);
      updateConnectionState();
      
      console.log(`Real-time subscription created: ${id}`);
      return id;

    } catch (error) {
      setLastError(error as Error);
      setState(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
      throw error;
    }
  }, [enablePresence, enableBroadcast, batchUpdates, bufferTime, updateConnectionState]);

  /**
   * Unsubscribe from real-time updates
   */
  const unsubscribe = useCallback(async (subscriptionId: string): Promise<void> => {
    try {
      await subscriptionManager.unsubscribe(subscriptionId);
      subscriptionsRef.current.delete(subscriptionId);
      updateConnectionState();
      
      console.log(`Real-time subscription removed: ${subscriptionId}`);
    } catch (error) {
      setLastError(error as Error);
      setState(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
      throw error;
    }
  }, [updateConnectionState]);

  /**
   * Track user presence in a channel
   */
  const trackPresence = useCallback(async (
    channelName: string,
    userData: PresenceTrackingData
  ): Promise<void> => {
    try {
      await subscriptionManager.trackPresence(channelName, userData);
      presenceChannelsRef.current.add(channelName);
      
      console.log(`Tracking presence in ${channelName}:`, userData.user_id);
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, []);

  /**
   * Stop tracking user presence
   */
  const untrackPresence = useCallback(async (channelName: string): Promise<void> => {
    try {
      await subscriptionManager.untrackPresence(channelName);
      presenceChannelsRef.current.delete(channelName);
      
      console.log(`Stopped tracking presence in ${channelName}`);
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, []);

  /**
   * Subscribe to presence updates
   */
  const subscribeToPresence = useCallback(async (
    channelName: string,
    callback: (presences: PresenceTrackingData[]) => void
  ): Promise<string> => {
    try {
      const id = await subscriptionManager.subscribeToPresence(channelName, callback);
      subscriptionsRef.current.add(id);
      
      // Update presence count when presence changes
      setState(prev => ({ ...prev, presenceCount: 0 }));

      console.log(`Subscribed to presence in ${channelName}`);
      return id;

    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, []);

  /**
   * Broadcast message to channel
   */
  const broadcast = useCallback(async (
    channelName: string,
    event: BroadcastEvent
  ): Promise<void> => {
    try {
      // Convert payload to Record<string, unknown> format expected by subscription manager
      const managerEvent = {
        ...event,
        payload: event.payload as Record<string, unknown>
      };
      await subscriptionManager.broadcast(channelName, managerEvent);
      
      setState(prev => ({ 
        ...prev, 
        lastActivity: new Date(),
      }));

      console.log(`Broadcast sent to ${channelName}:`, event.type);
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, []);

  /**
   * Subscribe to live scoring session
   */
  const subscribeToScoringSession = useCallback(async (
    sessionId: string,
    callback: (session: LiveScoringSession) => void
  ): Promise<string> => {
    try {
      const id = await subscriptionManager.subscribeToScoringSession(sessionId, callback);
      subscriptionsRef.current.add(id);
      
      console.log(`Subscribed to scoring session: ${sessionId}`);
      return id;

    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, []);

  /**
   * Subscribe to entry check-ins
   */
  const subscribeToCheckIns = useCallback(async (
    showId: string,
    callback: (checkIn: CheckInInfo) => void
  ): Promise<string> => {
    try {
      const id = await subscriptionManager.subscribeToCheckIns(showId, (data) => {
        // Convert Record<string, unknown> to CheckInInfo
        if (data && typeof data === 'object' && 'entryId' in data) {
          const statusValue = String(data.status || 'none');
          const validStatuses = ['none', 'checked-in', 'conflict', 'pulled', 'at-gate', 'go-to-gate', 'late'];
          const checkIn: CheckInInfo = {
            entryId: String(data.entryId || ''),
            status: validStatuses.includes(statusValue) ? statusValue as CheckInStatus : 'none',
            timestamp: data.timestamp instanceof Date ? data.timestamp : new Date(String(data.timestamp || Date.now())),
            updatedBy: String(data.updatedBy || 'system')
          };
          callback(checkIn);
        }
      });
      subscriptionsRef.current.add(id);
      
      console.log(`Subscribed to check-ins for show: ${showId}`);
      return id;

    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, []);

  /**
   * Connect to real-time services
   */
  const connect = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isConnecting: true }));
      await connectionManager.connect();
      updateConnectionState();
      
      console.log('Real-time connection established');
    } catch (error) {
      setLastError(error as Error);
      setState(prev => ({ 
        ...prev, 
        isConnecting: false,
        errorCount: prev.errorCount + 1,
      }));
      
      if (retryOnFailure) {
        console.log('Retrying connection in 5 seconds...');
        setTimeout(() => connect(), 5000);
      }
      
      throw error;
    }
  }, [retryOnFailure, updateConnectionState]);

  /**
   * Disconnect from real-time services
   */
  const disconnect = useCallback(async (): Promise<void> => {
    try {
      await connectionManager.disconnect();
      updateConnectionState();
      
      console.log('Real-time connection closed');
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [updateConnectionState]);

  /**
   * Force reconnection
   */
  const forceReconnect = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isConnecting: true }));
      await connectionManager.forceReconnect();
      updateConnectionState();
      
      console.log('Real-time connection reestablished');
    } catch (error) {
      setLastError(error as Error);
      setState(prev => ({ 
        ...prev, 
        isConnecting: false,
        errorCount: prev.errorCount + 1,
      }));
      throw error;
    }
  }, [updateConnectionState]);

  /**
   * Get subscription metrics
   */
  const getMetrics = useCallback((): SubscriptionMetrics[] => {
    const rawMetrics = subscriptionManager.getMetrics();
    const metricsArray = Array.isArray(rawMetrics) ? rawMetrics : [rawMetrics];
    
    return metricsArray.map(m => ({
      subscriptions: 1,
      activeChannels: m.isActive ? 1 : 0,
      messagesReceived: m.messagesReceived || 0,
      messagesLost: 0,
      averageLatency: m.averageProcessingTime || 0
    }));
  }, []);

  /**
   * Get connection health
   */
  const getConnectionHealth = useCallback((): ConnectionHealth => {
    return connectionManager.getConnectionHealth();
  }, []);

  /**
   * Clear last error
   */
  const clearError = useCallback((): void => {
    setLastError(null);
  }, []);

  /**
   * Setup connection event listeners
   */
  useEffect(() => {
    const unsubscribeStateChange = connectionManager.addEventListener(
      'stateChange',
      updateConnectionState
    );

    const unsubscribeConnected = connectionManager.addEventListener(
      'connected',
      () => {
        console.log('Real-time connection event: connected');
        updateConnectionState();
      }
    );

    const unsubscribeDisconnected = connectionManager.addEventListener(
      'disconnected',
      () => {
        console.log('Real-time connection event: disconnected');
        updateConnectionState();
      }
    );

    const unsubscribeError = connectionManager.addEventListener(
      'error',
      (event) => {
        console.error('Real-time connection error:', event.details?.error);
        setLastError(event.details?.error || new Error('Connection error'));
        setState(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
      }
    );

    cleanupFunctionsRef.current.push(
      unsubscribeStateChange,
      unsubscribeConnected,
      unsubscribeDisconnected,
      unsubscribeError
    );

    return () => {
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
    };
  }, [updateConnectionState]);

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (autoConnect) {
      connect().catch(error => {
        console.error('Auto-connect failed:', error);
      });
    }

    // Copy ref values early to avoid stale reference warnings
    const currentSubscriptions = subscriptionsRef.current;
    const currentPresenceChannels = presenceChannelsRef.current;
    const currentCleanupFunctions = cleanupFunctionsRef.current;

    // Cleanup on unmount
    return () => {
      // Unsubscribe from all subscriptions
      currentSubscriptions.forEach(id => {
        unsubscribe(id).catch(error => {
          console.warn(`Failed to cleanup subscription ${id}:`, error);
        });
      });

      // Stop tracking presence in all channels
      currentPresenceChannels.forEach(channelName => {
        untrackPresence(channelName).catch(error => {
          console.warn(`Failed to cleanup presence in ${channelName}:`, error);
        });
      });

      // Run all cleanup functions
      currentCleanupFunctions.forEach(cleanup => cleanup());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]); // Only run on mount - cleanup functions are intentionally omitted to prevent re-running

  /**
   * Update state periodically
   */
  useEffect(() => {
    const interval = setInterval(updateConnectionState, 5000);
    return () => clearInterval(interval);
  }, [updateConnectionState]);

  return {
    // State
    state,
    connectionState,
    
    // Subscription management
    subscribe,
    unsubscribe,
    
    // Presence tracking
    trackPresence,
    untrackPresence,
    subscribeToPresence,
    
    // Broadcasting
    broadcast,
    
    // Specialized subscriptions
    subscribeToScoringSession,
    subscribeToCheckIns,
    
    // Connection control
    connect,
    disconnect,
    forceReconnect,
    
    // Metrics and debugging
    getMetrics,
    getConnectionHealth,
    
    // Error handling
    lastError,
    clearError,
  };
};

export default useRealtime;