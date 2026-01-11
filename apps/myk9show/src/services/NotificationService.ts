/**
 * Real-time notification service using WebSocket communication
 * Foundation Phase implementation for all role workflows
 */

import { NotificationMessage, NotificationType } from '@/types/audit-types';
import { logger } from '@/services/LoggingService';

export interface NotificationHandler {
  (message: NotificationMessage): void;
}

export interface ChannelSubscription {
  channel: string;
  handler: NotificationHandler;
}

export interface WebSocketConfig {
  url: string;
  token: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

export class NotificationService {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, Set<NotificationHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 1000;
  private config: WebSocketConfig | null = null;
  private isConnecting = false;
  private messageQueue: NotificationMessage[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  async connect(config: WebSocketConfig): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.config = config;
    this.isConnecting = true;

    try {
      const url = `${config.url}?token=${config.token}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        logger.info('WebSocket connected', 'notifications');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.processMessageQueue();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as NotificationMessage;
          this.handleMessage(message);
        } catch (error) {
          logger.error('Failed to parse WebSocket message', 'notifications', {}, error as Error);
        }
      };

      this.ws.onclose = (event) => {
        logger.info('WebSocket disconnected', 'notifications', { code: event.code, reason: event.reason });
        this.isConnecting = false;
        this.stopHeartbeat();

        if (!event.wasClean) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error', 'notifications', {}, error as Error);
        this.isConnecting = false;
      };

    } catch (error) {
      logger.error('Failed to connect WebSocket', 'notifications', {}, error as Error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }

    this.subscribers.clear();
    this.messageQueue = [];
    this.reconnectAttempts = 0;
  }

  subscribe(channel: string, handler: NotificationHandler): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }

    this.subscribers.get(channel)!.add(handler);

    // Send subscription message to server
    this.sendMessage({
      id: this.generateId(),
      type: NotificationType.STATUS_UPDATE,
      channel: 'system',
      timestamp: new Date(),
      sender: { id: 'client', name: 'Client', role: 'system' },
      data: { action: 'subscribe', channel }
    });

    // Return unsubscribe function
    return () => {
      const channelSubscribers = this.subscribers.get(channel);
      if (channelSubscribers) {
        channelSubscribers.delete(handler);
        
        if (channelSubscribers.size === 0) {
          this.subscribers.delete(channel);
          
          // Send unsubscribe message to server
          this.sendMessage({
            id: this.generateId(),
            type: NotificationType.STATUS_UPDATE,
            channel: 'system',
            timestamp: new Date(),
            sender: { id: 'client', name: 'Client', role: 'system' },
            data: { action: 'unsubscribe', channel }
          });
        }
      }
    };
  }

  publish(message: Omit<NotificationMessage, 'id' | 'timestamp'>): void {
    const fullMessage: NotificationMessage = {
      ...message,
      id: this.generateId(),
      timestamp: new Date()
    };

    this.sendMessage(fullMessage);
  }

  private handleMessage(message: NotificationMessage): void {
    // Handle system messages
    if (message.type === NotificationType.SYSTEM_ALERT && 
        message.data && 
        typeof message.data === 'object' && 
        'action' in message.data && 
        (message.data as { action: string }).action === 'ping') {
      this.sendMessage({
        id: this.generateId(),
        type: NotificationType.SYSTEM_ALERT,
        channel: 'system',
        timestamp: new Date(),
        sender: { id: 'client', name: 'Client', role: 'system' },
        data: { action: 'pong' }
      });
      return;
    }

    // Route message to subscribers
    const channelSubscribers = this.subscribers.get(message.channel);
    if (channelSubscribers) {
      channelSubscribers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          logger.error('Error in notification handler', 'notifications', { channel: message.channel }, error as Error);
        }
      });
    }

    // Also route to wildcard subscribers (channel:*)
    const wildcardChannel = message.channel.split(':')[0] + ':*';
    const wildcardSubscribers = this.subscribers.get(wildcardChannel);
    if (wildcardSubscribers) {
      wildcardSubscribers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          logger.error('Error in wildcard notification handler', 'notifications', { channel: wildcardChannel }, error as Error);
        }
      });
    }
  }

  private sendMessage(message: NotificationMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Failed to send WebSocket message', 'notifications', {}, error as Error);
        this.queueMessage(message);
      }
    } else {
      this.queueMessage(message);
    }
  }

  private queueMessage(message: NotificationMessage): void {
    this.messageQueue.push(message);
    
    // Keep queue size reasonable
    if (this.messageQueue.length > 100) {
      this.messageQueue = this.messageQueue.slice(-50);
    }
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      this.sendMessage(message);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', 'notifications', { attempts: this.maxReconnectAttempts });
      return;
    }

    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      30000
    );

    setTimeout(() => {
      if (this.config) {
        this.reconnectAttempts++;
        logger.debug('Attempting to reconnect', 'notifications', { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts });
        this.connect(this.config);
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendMessage({
        id: this.generateId(),
        type: NotificationType.SYSTEM_ALERT,
        channel: 'system',
        timestamp: new Date(),
        sender: { id: 'client', name: 'Client', role: 'system' },
        data: { action: 'ping' }
      });
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Page is hidden, reduce activity
      this.stopHeartbeat();
    } else {
      // Page is visible, resume activity
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.startHeartbeat();
      } else if (this.config) {
        // Reconnect if disconnected
        this.connect(this.config);
      }
    }
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Utility methods for common notification patterns
  subscribeToUserChannel(userId: string, handler: NotificationHandler): () => void {
    return this.subscribe(`user:${userId}`, handler);
  }

  subscribeToShowChannel(showId: string, handler: NotificationHandler): () => void {
    return this.subscribe(`show:${showId}`, handler);
  }

  subscribeToClassChannel(classId: string, handler: NotificationHandler): () => void {
    return this.subscribe(`class:${classId}`, handler);
  }

  subscribeToRoleChannel(role: string, handler: NotificationHandler): () => void {
    return this.subscribe(`role:${role}`, handler);
  }

  publishStatusUpdate(data: Record<string, unknown>, channel: string): void {
    this.publish({
      type: NotificationType.STATUS_UPDATE,
      channel,
      sender: { id: 'client', name: 'Client', role: 'system' },
      data
    });
  }

  publishEntryChange(entryId: string, data: Record<string, unknown>): void {
    this.publish({
      type: NotificationType.ENTRY_CHANGE,
      channel: `entry:${entryId}`,
      sender: { id: 'client', name: 'Client', role: 'system' },
      data
    });
  }

  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (this.isConnecting) return 'connecting';
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return 'connected';
    return 'disconnected';
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.disconnect();
  }
}

// Global singleton instance
export const notificationService = new NotificationService();

// React hook for easy usage
import { useEffect, useState } from 'react';

export const useNotifications = (channel: string, handler: NotificationHandler) => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const updateConnectionStatus = () => {
      setIsConnected(notificationService.getConnectionStatus() === 'connected');
    };

    // Initial status
    updateConnectionStatus();

    // Subscribe to channel
    const unsubscribe = notificationService.subscribe(channel, handler);

    // Monitor connection status
    const statusInterval = setInterval(updateConnectionStatus, 1000);

    return () => {
      unsubscribe();
      clearInterval(statusInterval);
    };
  }, [channel, handler]);

  return { isConnected };
};

// Hook for real-time status updates
export const useStatusUpdates = (entityType: string, entityId: string) => {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const handler = (message: NotificationMessage) => {
      if (message.type === NotificationType.STATUS_UPDATE) {
        setStatus(message.data as Record<string, unknown> | null);
        setLastUpdate(message.timestamp);
      }
    };

    const unsubscribe = notificationService.subscribe(`${entityType}:${entityId}`, handler);

    return unsubscribe;
  }, [entityType, entityId]);

  return { status, lastUpdate };
};