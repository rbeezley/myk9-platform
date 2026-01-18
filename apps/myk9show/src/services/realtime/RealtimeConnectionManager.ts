import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import { logger } from '@/services/LoggingService';

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastConnected: Date | null;
  reconnectAttempts: number;
  error: string | null;
}

export interface ConnectionMetrics {
  totalConnections: number;
  totalDisconnections: number;
  averageReconnectTime: number;
  lastReconnectTime: number;
  connectionUptime: number;
}

interface RealtimeConnectionConfig {
  maxReconnectAttempts: number;
  baseReconnectDelay: number;
  maxReconnectDelay: number;
  heartbeatInterval: number;
  connectionTimeout: number;
}

export interface RealtimeEventData {
  event: string;
  payload: Record<string, unknown>;
  timestamp: number;
  channel?: string;
}

export type RealtimeEventCallback = (data: RealtimeEventData) => void;

export interface ChannelConfig {
  config?: {
    broadcast?: {
      self?: boolean;
      ack?: boolean;
    };
    presence?: {
      key?: string;
    };
    private?: boolean;
  };
}

export class RealtimeConnectionManager {
  private static instance: RealtimeConnectionManager;
  private channels = new Map<string, RealtimeChannel>();
  private connectionState: ConnectionState = {
    status: 'disconnected',
    lastConnected: null,
    reconnectAttempts: 0,
    error: null
  };
  
  private metrics: ConnectionMetrics = {
    totalConnections: 0,
    totalDisconnections: 0,
    averageReconnectTime: 0,
    lastReconnectTime: 0,
    connectionUptime: 0
  };

  private config: RealtimeConnectionConfig = {
    maxReconnectAttempts: 10,
    baseReconnectDelay: 1000,
    maxReconnectDelay: 30000,
    heartbeatInterval: 30000,
    connectionTimeout: 10000
  };

  private listeners = new Map<string, Set<RealtimeEventCallback>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionStartTime: number | null = null;

  private constructor() {
    this.initializeConnectionMonitoring();
  }

  static getInstance(): RealtimeConnectionManager {
    if (!RealtimeConnectionManager.instance) {
      RealtimeConnectionManager.instance = new RealtimeConnectionManager();
    }
    return RealtimeConnectionManager.instance;
  }

  private initializeConnectionMonitoring() {
    // Monitor network status
    window.addEventListener('online', this.handleNetworkOnline.bind(this));
    window.addEventListener('offline', this.handleNetworkOffline.bind(this));
    
    // Monitor visibility changes (tab switching)
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Monitor page unload
    window.addEventListener('beforeunload', this.handlePageUnload.bind(this));
    
    // Start initial connection
    this.connect();
  }

  async connect(): Promise<void> {
    if (this.connectionState.status === 'connecting' || this.connectionState.status === 'connected') {
      return;
    }

    this.updateConnectionState({
      status: 'connecting',
      error: null
    });

    this.connectionStartTime = Date.now();

    try {
      // Test connection with a simple operation
      await this.testConnection();
      
      this.updateConnectionState({
        status: 'connected',
        lastConnected: new Date(),
        reconnectAttempts: 0,
        error: null
      });

      this.metrics.totalConnections++;
      this.startHeartbeat();
      
      logger.info('Realtime connection established', 'realtime');

    } catch (error) {
      logger.error('Failed to establish realtime connection', 'realtime', {}, error as Error);
      
      this.updateConnectionState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Connection failed'
      });

      this.scheduleReconnect();
    }
  }

  private async testConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection test timeout'));
      }, this.config.connectionTimeout);

      // Create a temporary channel to test connection
      const testChannel = supabase.channel('connection-test');
      
      testChannel.subscribe((status) => {
        clearTimeout(timeout);
        
        if (status === 'SUBSCRIBED') {
          testChannel.unsubscribe();
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          testChannel.unsubscribe();
          reject(new Error(`Connection test failed: ${status}`));
        }
      });
    });
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  private async sendHeartbeat() {
    try {
      // Send heartbeat through existing channels or create a temporary one
      const heartbeatChannel = this.channels.get('heartbeat') || 
        supabase.channel('heartbeat-' + Date.now());
      
      await heartbeatChannel.send({
        type: 'broadcast',
        event: 'heartbeat',
        payload: { timestamp: Date.now() }
      });
      
    } catch (error) {
      logger.warn('Heartbeat failed', 'realtime', {}, error as Error);
      this.handleConnectionLoss();
    }
  }

  private handleConnectionLoss() {
    if (this.connectionState.status === 'connected') {
      this.updateConnectionState({
        status: 'disconnected',
        error: 'Connection lost'
      });

      this.metrics.totalDisconnections++;
      this.stopHeartbeat();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.connectionState.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', 'realtime', { attempts: this.connectionState.reconnectAttempts });
      this.updateConnectionState({
        status: 'error',
        error: 'Max reconnection attempts exceeded'
      });
      return;
    }

    const delay = Math.min(
      this.config.baseReconnectDelay * Math.pow(2, this.connectionState.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    logger.debug('Scheduling reconnect attempt', 'realtime', { attempt: this.connectionState.reconnectAttempts + 1, delayMs: delay });

    this.reconnectTimer = setTimeout(() => {
      this.connectionState.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private updateConnectionState(updates: Partial<ConnectionState>) {
    this.connectionState = { ...this.connectionState, ...updates };
    
    // Update metrics
    if (updates.status === 'connected' && this.connectionStartTime) {
      const reconnectTime = Date.now() - this.connectionStartTime;
      this.metrics.lastReconnectTime = reconnectTime;
      
      // Update average reconnect time
      if (this.metrics.totalConnections > 1) {
        this.metrics.averageReconnectTime = 
          (this.metrics.averageReconnectTime * (this.metrics.totalConnections - 1) + reconnectTime) / 
          this.metrics.totalConnections;
      } else {
        this.metrics.averageReconnectTime = reconnectTime;
      }
    }
    
    // Notify listeners
    this.notifyListeners('state-change', this.connectionState);
  }

  // Network event handlers
  private handleNetworkOnline() {
    logger.info('Network connection restored', 'realtime');
    if (this.connectionState.status !== 'connected') {
      this.connect();
    }
  }

  private handleNetworkOffline() {
    logger.warn('Network connection lost', 'realtime');
    this.updateConnectionState({
      status: 'disconnected',
      error: 'Network offline'
    });
    this.stopHeartbeat();
  }

  private handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // Tab became active - check connection
      if (this.connectionState.status === 'disconnected') {
        this.connect();
      }
    }
  }

  private handlePageUnload() {
    // Cleanup connections
    this.disconnect();
  }

  // Channel management
  async createChannel(
    channelName: string, 
    config?: ChannelConfig
  ): Promise<RealtimeChannel> {
    if (this.channels.has(channelName)) {
      return this.channels.get(channelName)!;
    }

    const channel = supabase.channel(channelName, config?.config ? { ...config.config, config: {} } : { config: {} });
    this.channels.set(channelName, channel);

    // Monitor channel status
    channel.subscribe((status) => {
      logger.debug('Channel status changed', 'realtime', { channelName, status });

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.handleChannelError(channelName, status);
      }
    });

    return channel;
  }

  async removeChannel(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (channel) {
      await channel.unsubscribe();
      this.channels.delete(channelName);
    }
  }

  private handleChannelError(channelName: string, error: string) {
    logger.error('Channel error', 'realtime', { channelName, error });

    // Remove and recreate the channel
    this.removeChannel(channelName);
    
    // Notify about channel error
    this.notifyListeners('channel-error', { channelName, error });
  }

  // Public API
  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  getConnectionMetrics(): ConnectionMetrics {
    const uptime = this.connectionState.lastConnected ? 
      Date.now() - this.connectionState.lastConnected.getTime() : 0;
    
    return {
      ...this.metrics,
      connectionUptime: uptime
    };
  }

  isConnected(): boolean {
    return this.connectionState.status === 'connected';
  }

  async forceReconnect(): Promise<void> {
    this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.connect();
  }

  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Unsubscribe from all channels
    this.channels.forEach(async (channel, name) => {
      try {
        await channel.unsubscribe();
      } catch (error) {
        logger.warn('Error unsubscribing from channel', 'realtime', { channelName: name }, error as Error);
      }
    });
    
    this.channels.clear();

    this.updateConnectionState({
      status: 'disconnected',
      error: null
    });
  }

  // Event subscription
  addConnectionListener(
    event: string, 
    callback: RealtimeEventCallback
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(callback);
    
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private notifyListeners(event: string, data: unknown) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          // Convert data to RealtimeEventData format
          const eventData: RealtimeEventData = {
            event,
            payload: typeof data === 'object' && data !== null ? data as Record<string, unknown> : { data },
            timestamp: Date.now()
          };
          callback(eventData);
        } catch (error) {
          logger.error('Error in connection listener', 'realtime', { event }, error as Error);
        }
      });
    }
  }

  // Configuration
  updateConfig(config: Partial<RealtimeConnectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RealtimeConnectionConfig {
    return { ...this.config };
  }
}