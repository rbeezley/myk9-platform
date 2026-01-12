import { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';
import { logger } from '@/services/LoggingService';

export interface UserPresence {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'secretary' | 'judge' | 'exhibitor';
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen: Date;
  currentLocation?: {
    page: string;
    entityId?: string;
    entityType?: 'show' | 'dog' | 'person' | 'club' | 'entry';
  };
  activity?: {
    type: 'viewing' | 'editing' | 'scoring' | 'judging';
    details?: string;
    startedAt: Date;
  };
}

export interface PresenceUpdate {
  userId: string;
  presence: Partial<UserPresence>;
  timestamp: Date;
}

export class PresenceService {
  private static instance: PresenceService;
  private channel: RealtimeChannel | null = null;
  private currentUser: UserPresence | null = null;
  private presenceMap: Map<string, UserPresence> = new Map();
  private subscribers: Set<(update: PresenceUpdate) => void> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private constructor() {}

  static getInstance(): PresenceService {
    if (!PresenceService.instance) {
      PresenceService.instance = new PresenceService();
    }
    return PresenceService.instance;
  }

  async initialize(user: Omit<UserPresence, 'lastSeen'>): Promise<void> {
    try {
      this.currentUser = {
        ...user,
        lastSeen: new Date(),
        status: 'online'
      };

      // Create presence channel
      this.channel = supabase.channel('presence:global', {
        config: {
          presence: {
            key: user.id
          }
        }
      });

      // Set up presence state handlers
      this.channel
        .on('presence', { event: 'sync' }, () => {
          const state = this.channel!.presenceState() as RealtimePresenceState<UserPresence>;
          this.handlePresenceSync(state);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          this.handlePresenceJoin(key, newPresences as unknown as UserPresence[]);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          this.handlePresenceLeave(key, leftPresences as unknown as UserPresence[]);
        });

      // Subscribe to channel
      await this.channel.subscribe();

      // Track initial presence
      await this.updatePresence({
        ...this.currentUser,
        currentLocation: {
          page: window.location.pathname
        }
      });

      // Start heartbeat
      this.startHeartbeat();

      // Set up page visibility handler
      this.setupVisibilityHandler();

      // Set up beforeunload handler
      this.setupUnloadHandler();

    } catch (error) {
      logger.error('Failed to initialize presence service:', 'collaboration', {}, error as Error);
      throw error;
    }
  }

  async updatePresence(updates: Partial<UserPresence>): Promise<void> {
    if (!this.currentUser || !this.channel) return;

    try {
      this.currentUser = {
        ...this.currentUser,
        ...updates,
        lastSeen: new Date()
      };

      await this.channel.track(this.currentUser);

      // Notify local subscribers
      this.notifySubscribers({
        userId: this.currentUser.id,
        presence: updates,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to update presence:', 'collaboration', {}, error as Error);
    }
  }

  async updateLocation(page: string, entityId?: string, entityType?: 'show' | 'dog' | 'person' | 'club' | 'entry'): Promise<void> {
    await this.updatePresence({
      currentLocation: {
        page,
        entityId,
        entityType
      }
    });
  }

  async updateActivity(
    type: 'viewing' | 'editing' | 'scoring' | 'judging',
    details?: string
  ): Promise<void> {
    await this.updatePresence({
      activity: {
        type,
        details,
        startedAt: new Date()
      }
    });
  }

  async updateStatus(status: 'online' | 'away' | 'busy' | 'offline'): Promise<void> {
    await this.updatePresence({ status });
  }

  getActiveUsers(): UserPresence[] {
    return Array.from(this.presenceMap.values());
  }

  getActiveUsersForEntity(entityType: string, entityId: string): UserPresence[] {
    return this.getActiveUsers().filter(user =>
      user.currentLocation?.entityType === entityType &&
      user.currentLocation?.entityId === entityId
    );
  }

  getActiveUsersOnPage(page: string): UserPresence[] {
    return this.getActiveUsers().filter(user =>
      user.currentLocation?.page === page
    );
  }

  isUserEditing(entityType: string, entityId: string): UserPresence | null {
    const editingUsers = this.getActiveUsersForEntity(entityType, entityId)
      .filter(user => user.activity?.type === 'editing');
    return editingUsers[0] || null;
  }

  getUsersWithRole(role: UserPresence['role']): UserPresence[] {
    return this.getActiveUsers().filter(user => user.role === role);
  }

  subscribe(callback: (update: PresenceUpdate) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private handlePresenceSync(state: RealtimePresenceState<UserPresence>): void {
    this.presenceMap.clear();
    
    Object.entries(state).forEach(([key, presences]) => {
      if (presences.length > 0) {
        const presence = presences[0] as UserPresence;
        this.presenceMap.set(key, presence);
      }
    });

    // Notify about full sync
    this.notifySubscribers({
      userId: 'system',
      presence: {},
      timestamp: new Date()
    });
  }

  private handlePresenceJoin(key: string, newPresences: UserPresence[]): void {
    if (newPresences.length > 0) {
      const presence = newPresences[0];
      this.presenceMap.set(key, presence);
      
      this.notifySubscribers({
        userId: key,
        presence,
        timestamp: new Date()
      });
    }
  }

  private handlePresenceLeave(key: string, leftPresences: UserPresence[]): void {
    this.presenceMap.delete(key);
    
    if (leftPresences.length > 0) {
      this.notifySubscribers({
        userId: key,
        presence: { status: 'offline' as const },
        timestamp: new Date()
      });
    }
  }

  private notifySubscribers(update: PresenceUpdate): void {
    this.subscribers.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        logger.error('Presence subscriber error:', 'collaboration', {}, error as Error);
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.updatePresence({ lastSeen: new Date() });
    }, 30000); // Every 30 seconds
  }

  private setupVisibilityHandler(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.updateStatus('away');
      } else {
        this.updateStatus('online');
      }
    });
  }

  private setupUnloadHandler(): void {
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
  }

  async cleanup(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.channel) {
      await this.channel.untrack();
      await this.channel.unsubscribe();
      this.channel = null;
    }

    this.presenceMap.clear();
    this.subscribers.clear();
  }

  // Recovery methods
  async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', 'collaboration', {});
      return;
    }

    this.reconnectAttempts++;
    
    try {
      await this.cleanup();
      await new Promise(resolve => setTimeout(resolve, 1000 * this.reconnectAttempts));
      
      if (this.currentUser) {
        await this.initialize(this.currentUser);
        this.reconnectAttempts = 0;
      }
    } catch (error) {
      logger.error('Reconnection failed:', 'collaboration', {}, error as Error);
      setTimeout(() => this.reconnect(), 5000);
    }
  }
}

export const presenceService = PresenceService.getInstance();