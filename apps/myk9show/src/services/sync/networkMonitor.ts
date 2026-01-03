// Network status monitoring for sync service
import type { NetworkStatus, SyncEventMap } from './types';
import { EventEmitter } from './eventEmitter';

export class NetworkMonitor {
  private eventEmitter: EventEmitter<SyncEventMap>;
  private status: NetworkStatus;
  private checkInterval?: NodeJS.Timeout;

  constructor(eventEmitter: EventEmitter<SyncEventMap>) {
    this.eventEmitter = eventEmitter;
    this.status = this.getCurrentStatus();
  }

  async initialize(): Promise<void> {
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));

    // Listen for connection change events if available
    if (this.hasConnectionAPI()) {
      const connection = this.getConnectionAPI();
      if (connection && typeof connection.addEventListener === 'function') {
        connection.addEventListener('change', this.handleConnectionChange.bind(this));
      }
    }

    // Start periodic status checks
    this.startStatusChecks();
  }

  getStatus(): NetworkStatus {
    return { ...this.status };
  }

  private getCurrentStatus(): NetworkStatus {
    const status: NetworkStatus = {
      isOnline: navigator.onLine
    };

    // Add connection information if available
    if (this.hasConnectionAPI()) {
      const connection = this.getConnectionAPI();
      if (connection) {
        status.connectionType = this.getConnectionType(connection);
        status.effectiveType = this.getEffectiveType(connection);
        status.downlink = this.getDownlink(connection);
        status.rtt = this.getRTT(connection);
        status.saveData = this.getSaveData(connection);
      }
    }

    return status;
  }

  private handleOnline(): void {
    const oldStatus = this.status;
    this.status = this.getCurrentStatus();
    
    if (!oldStatus.isOnline && this.status.isOnline) {
      this.eventEmitter.emit('network_changed', {
        type: 'network_changed',
        timestamp: new Date(),
        data: { status: this.status, previousStatus: oldStatus }
      });
    }
  }

  private handleOffline(): void {
    const oldStatus = this.status;
    this.status = this.getCurrentStatus();
    
    if (oldStatus.isOnline && !this.status.isOnline) {
      this.eventEmitter.emit('network_changed', {
        type: 'network_changed',
        timestamp: new Date(),
        data: { status: this.status, previousStatus: oldStatus }
      });
    }
  }

  private handleConnectionChange(): void {
    const oldStatus = this.status;
    this.status = this.getCurrentStatus();
    
    // Check if meaningful connection properties changed
    if (this.hasConnectionChanged(oldStatus, this.status)) {
      this.eventEmitter.emit('network_changed', {
        type: 'network_changed',
        timestamp: new Date(),
        data: { status: this.status, previousStatus: oldStatus }
      });
    }
  }

  private hasConnectionChanged(oldStatus: NetworkStatus, newStatus: NetworkStatus): boolean {
    return (
      oldStatus.isOnline !== newStatus.isOnline ||
      oldStatus.connectionType !== newStatus.connectionType ||
      oldStatus.effectiveType !== newStatus.effectiveType ||
      Math.abs((oldStatus.downlink || 0) - (newStatus.downlink || 0)) > 1 ||
      Math.abs((oldStatus.rtt || 0) - (newStatus.rtt || 0)) > 50
    );
  }

  private startStatusChecks(): void {
    // Check network status every 30 seconds
    this.checkInterval = setInterval(() => {
      const newStatus = this.getCurrentStatus();
      if (this.hasConnectionChanged(this.status, newStatus)) {
        const oldStatus = this.status;
        this.status = newStatus;
        this.eventEmitter.emit('network_changed', {
          type: 'network_changed',
          timestamp: new Date(),
          data: { status: this.status, previousStatus: oldStatus }
        });
      }
    }, 30000);
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    window.removeEventListener('online', this.handleOnline.bind(this));
    window.removeEventListener('offline', this.handleOffline.bind(this));

    if (this.hasConnectionAPI()) {
      const connection = this.getConnectionAPI();
      if (connection && typeof connection.removeEventListener === 'function') {
        connection.removeEventListener('change', this.handleConnectionChange.bind(this));
      }
    }
  }

  private hasConnectionAPI(): boolean {
    return 'connection' in navigator;
  }

  private getConnectionAPI(): Record<string, unknown> | null {
    if (!this.hasConnectionAPI()) return null;
    const navWithConnection = navigator as Navigator & { connection?: Record<string, unknown> };
    return navWithConnection.connection || null;
  }

  private getConnectionType(connection: Record<string, unknown>): 'wifi' | 'cellular' | 'ethernet' | 'unknown' {
    const type = connection.type;
    if (typeof type === 'string') {
      switch (type) {
        case 'wifi':
        case 'cellular':
        case 'ethernet':
          return type;
        default:
          return 'unknown';
      }
    }
    return 'unknown';
  }

  private getEffectiveType(connection: Record<string, unknown>): '2g' | '3g' | '4g' | 'slow-2g' | undefined {
    const effectiveType = connection.effectiveType;
    if (typeof effectiveType === 'string') {
      switch (effectiveType) {
        case '2g':
        case '3g':
        case '4g':
        case 'slow-2g':
          return effectiveType;
        default:
          return undefined;
      }
    }
    return undefined;
  }

  private getDownlink(connection: Record<string, unknown>): number | undefined {
    const downlink = connection.downlink;
    return typeof downlink === 'number' ? downlink : undefined;
  }

  private getRTT(connection: Record<string, unknown>): number | undefined {
    const rtt = connection.rtt;
    return typeof rtt === 'number' ? rtt : undefined;
  }

  private getSaveData(connection: Record<string, unknown>): boolean | undefined {
    const saveData = connection.saveData;
    return typeof saveData === 'boolean' ? saveData : undefined;
  }
}