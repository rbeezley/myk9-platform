import React, { createContext, useEffect, useState, useCallback, useRef } from 'react';
import { ExhibitorEvent, RingStatus, ExhibitorEntry, CheckInStatus } from '@/types/exhibitor-types';
import { logger } from '@/services/LoggingService';

interface WebSocketContextType {
  connected: boolean;
  ringStatus: Map<string, RingStatus>;
  entryUpdates: Map<string, ExhibitorEntry>;
  notifications: ExhibitorEvent[];
  subscribe: (classId: string) => void;
  unsubscribe: (classId: string) => void;
  clearNotifications: () => void;
  lastUpdate: Date | null;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);


interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string;
  exhibitorId: string;
}

const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ 
  children, 
  url = 'ws://localhost:3001/exhibitor',
  exhibitorId 
}) => {
  const [connected, setConnected] = useState(false);
  const [ringStatus, setRingStatus] = useState<Map<string, RingStatus>>(new Map());
  const [entryUpdates, setEntryUpdates] = useState<Map<string, ExhibitorEntry>>(new Map());
  const [notifications, setNotifications] = useState<ExhibitorEvent[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedClasses = useRef<Set<string>>(new Set());
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds

  // Handle incoming messages - declared before connect which uses it
  const handleMessage = useCallback((event: ExhibitorEvent) => {
    setLastUpdate(new Date());

    switch (event.type) {
      case 'ringUpdate':
        if (event.data && 'currentDog' in event.data) {
          setRingStatus(prev => {
            const next = new Map(prev);
            next.set(event.classId, event.data as RingStatus);
            return next;
          });
        }
        break;

      case 'resultPosted':
        // Update entry with result
        if (event.data && 'armband' in event.data) {
          setEntryUpdates(prev => {
            const next = new Map(prev);
            const entry = event.data as unknown as ExhibitorEntry;
            entry.checkInStatus = 'completed' as CheckInStatus;
            next.set(entry.id, entry);
            return next;
          });
        }
        break;

      case 'scheduleChange':
        // Handle schedule updates
        setNotifications(prev => [...prev, event]);
        break;

      case 'ringCall':
        // High priority notification
        setNotifications(prev => [event, ...prev]);
        // Could trigger push notification here
        if ('Notification' in window && Notification.permission === 'granted') {
          const ringData = event.data as { ringNumber?: number };
          const notificationOptions: NotificationOptions = {
            body: `You're needed at Ring ${ringData.ringNumber || 'Unknown'}`,
            icon: '/logo.png',
            badge: '/badge.png'
          };
          // Add vibrate if supported
          if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
          }
          new Notification('Ring Call!', notificationOptions);
        }
        break;

      default:
        logger.warn('Unknown event type', 'websocket', { eventType: event.type });
    }
  }, []);

  // Store connect function in a ref to enable self-reference in reconnect logic
  const connectRef = useRef<() => void>(() => {});

  // Establish WebSocket connection
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        logger.info('WebSocket connected', 'websocket', { url });
        setConnected(true);
        reconnectAttempts.current = 0;

        // Send authentication
        ws.send(JSON.stringify({
          type: 'auth',
          exhibitorId,
          timestamp: new Date().toISOString()
        }));

        // Re-subscribe to classes after reconnection
        subscribedClasses.current.forEach(classId => {
          ws.send(JSON.stringify({
            type: 'subscribe',
            classId,
            timestamp: new Date().toISOString()
          }));
        });
      };

      ws.onmessage = (event) => {
        try {
          const data: ExhibitorEvent = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          logger.error('Error parsing WebSocket message', 'websocket', {}, error as Error);
        }
      };

      ws.onerror = (error) => {
        logger.error('WebSocket error', 'websocket', { error });
      };

      ws.onclose = () => {
        logger.info('WebSocket disconnected', 'websocket');
        setConnected(false);
        wsRef.current = null;

        // Attempt to reconnect using the ref to avoid circular dependency
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          logger.info('Attempting to reconnect', 'websocket', { attempt: reconnectAttempts.current, maxAttempts: maxReconnectAttempts });
          reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), reconnectDelay);
        }
      };
    } catch (error) {
      logger.error('Error creating WebSocket connection', 'websocket', { url }, error as Error);
    }
  }, [url, exhibitorId, handleMessage]);

  // Keep the ref updated with the latest connect function via useEffect
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Subscribe to class updates
  const subscribe = useCallback((classId: string) => {
    subscribedClasses.current.add(classId);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        classId,
        timestamp: new Date().toISOString()
      }));
    }
  }, []);

  // Unsubscribe from class updates
  const unsubscribe = useCallback((classId: string) => {
    subscribedClasses.current.delete(classId);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        classId,
        timestamp: new Date().toISOString()
      }));
    }
  }, []);

  // Clear notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Initialize connection
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Ping to keep connection alive
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ping',
          timestamp: new Date().toISOString()
        }));
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(pingInterval);
  }, []);

  const value: WebSocketContextType = {
    connected,
    ringStatus,
    entryUpdates,
    notifications,
    subscribe,
    unsubscribe,
    clearNotifications,
    lastUpdate
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export { WebSocketContext, WebSocketProvider };