/**
 * Network Detection Service
 *
 * Monitors network connection status, type, and quality.
 * Provides information for WiFi-only sync and bandwidth-aware features.
 */

type ConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'bluetooth' | 'unknown';
type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';

/**
 * Network Information API connection type
 * @see https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
 */
interface NetworkInformationConnection {
  type?: string;
  effectiveType?: EffectiveType;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(event: 'change', handler: () => void): void;
}

/** Navigator with Network Information API (non-standard) */
interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformationConnection;
  mozConnection?: NetworkInformationConnection;
  webkitConnection?: NetworkInformationConnection;
}

export interface NetworkInfo {
  isOnline: boolean;
  connectionType: ConnectionType;
  effectiveType: EffectiveType;
  downlink?: number; // Mbps
  rtt?: number; // Round-trip time in ms
  saveData?: boolean; // User has enabled data saver
}

type NetworkChangeListener = (info: NetworkInfo) => void;

class NetworkDetectionService {
  private listeners: Set<NetworkChangeListener> = new Set();
  private currentInfo: NetworkInfo;

  constructor() {
    this.currentInfo = this.detectNetwork();
    this.setupListeners();
  }

  /**
   * Get current network information
   */
  getNetworkInfo(): NetworkInfo {
    return { ...this.currentInfo };
  }

  /**
   * Subscribe to network changes
   */
  subscribe(listener: NetworkChangeListener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(this.currentInfo);
    return () => this.listeners.delete(listener);
  }

  /**
   * Detect current network information
   */
  private detectNetwork(): NetworkInfo {
    const isOnline = navigator.onLine;

    // Try to get connection information from Network Information API
    const connection = this.getConnection();

    if (!connection) {
      return {
        isOnline,
        connectionType: 'unknown',
        effectiveType: 'unknown',
      };
    }

    return {
      isOnline,
      connectionType: this.getConnectionType(connection),
      effectiveType: (connection.effectiveType as EffectiveType) || 'unknown',
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
    };
  }

  /**
   * Get connection object from various browser APIs
   */
  private getConnection(): NetworkInformationConnection | undefined {
    const nav = navigator as NavigatorWithConnection;
    return nav.connection || nav.mozConnection || nav.webkitConnection;
  }

  /**
   * Determine connection type from connection object
   */
  private getConnectionType(connection: NetworkInformationConnection): ConnectionType {
    const type = connection.type;

    if (!type) {
      // Try to infer from effectiveType
      const effectiveType = connection.effectiveType;
      if (effectiveType === '4g') {
        // Could be wifi or cellular, check if mobile
        if (this.isMobileDevice()) {
          return 'cellular';
        }
        return 'wifi';
      }
      return 'unknown';
    }

    // Map connection.type to our ConnectionType
    switch (type) {
      case 'wifi':
        return 'wifi';
      case 'cellular':
      case '2g':
      case '3g':
      case '4g':
      case '5g':
        return 'cellular';
      case 'ethernet':
      case 'wired':
        return 'ethernet';
      case 'bluetooth':
        return 'bluetooth';
      default:
        return 'unknown';
    }
  }

  /**
   * Check if device is mobile
   */
  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  /**
   * Setup event listeners for network changes
   */
  private setupListeners() {
    if (typeof window === 'undefined') {
      return;
    }

    // Listen for online/offline events
    window.addEventListener('online', () => this.handleNetworkChange());
    window.addEventListener('offline', () => this.handleNetworkChange());

    // Listen for connection changes
    const connection = this.getConnection();
    if (connection) {
      connection.addEventListener('change', () => this.handleNetworkChange());
    }
  }

  /**
   * Handle network change event
   */
  private handleNetworkChange() {
    const newInfo = this.detectNetwork();
    this.currentInfo = newInfo;

    // Notify listeners
    this.listeners.forEach((listener) => {
      listener(newInfo);
    });

    // Network change logging removed - state changes tracked internally
  }

  /**
   * Check if on WiFi
   */
  isWiFi(): boolean {
    return this.currentInfo.connectionType === 'wifi' ||
           this.currentInfo.connectionType === 'ethernet';
  }

  /**
   * Check if on cellular
   */
  isCellular(): boolean {
    return this.currentInfo.connectionType === 'cellular';
  }

  /**
   * Check if connection is slow
   */
  isSlowConnection(): boolean {
    const { effectiveType, downlink } = this.currentInfo;

    // Check effective type
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      return true;
    }

    // Check downlink speed (< 1 Mbps is considered slow)
    if (downlink !== undefined && downlink < 1) {
      return true;
    }

    return false;
  }

  /**
   * Check if user has enabled data saver
   */
  isDataSaverEnabled(): boolean {
    return this.currentInfo.saveData === true;
  }

  /**
   * Get estimated bandwidth in Mbps
   */
  getEstimatedBandwidth(): number | null {
    return this.currentInfo.downlink || null;
  }

  /**
   * Get round-trip time in ms
   */
  getRTT(): number | null {
    return this.currentInfo.rtt || null;
  }

  /**
   * Check if network is suitable for large downloads
   */
  isSuitableForDownloads(): boolean {
    const { isOnline, downlink, saveData } = this.currentInfo;

    // Not online
    if (!isOnline) {
      return false;
    }

    // User has data saver enabled
    if (saveData) {
      return false;
    }

    // Slow connection
    if (this.isSlowConnection()) {
      return false;
    }

    // Good connection (> 2 Mbps)
    if (downlink !== undefined && downlink >= 2) {
      return true;
    }

    // Unknown but online and not slow
    return true;
  }

  /**
   * Get recommended sync strategy based on network
   */
  getRecommendedSyncStrategy(): 'immediate' | 'batched' | 'deferred' {
    const { isOnline, effectiveType, downlink, saveData } = this.currentInfo;

    // Offline - defer
    if (!isOnline) {
      return 'deferred';
    }

    // Data saver enabled - batch
    if (saveData) {
      return 'batched';
    }

    // Slow connection - batch or defer
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      return 'deferred';
    }

    if (effectiveType === '3g') {
      return 'batched';
    }

    // Fast connection - immediate
    if (effectiveType === '4g' || (downlink !== undefined && downlink >= 2)) {
      return 'immediate';
    }

    // Default to batched
    return 'batched';
  }

  /**
   * Estimate data usage rate in KB/s
   */
  estimateDataUsage(): number | null {
    const { downlink } = this.currentInfo;

    if (!downlink) {
      return null;
    }

    // Convert Mbps to KB/s
    // 1 Mbps = 125 KB/s
    return downlink * 125;
  }
}

// Export singleton instance
export const networkDetectionService = new NetworkDetectionService();
