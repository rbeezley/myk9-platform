/**
 * Logging Service for myK9Show
 * Provides structured logging with multiple transports and environments
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  category: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  stack?: string;
  fingerprint?: string;
}

export interface LogTransport {
  name: string;
  log(entry: LogEntry): Promise<void>;
  flush?(): Promise<void>;
}

/**
 * Console Transport for development logging
 */
class ConsoleTransport implements LogTransport {
  name = 'console';

  async log(entry: LogEntry): Promise<void> {
    const logMethod = this.getConsoleMethod(entry.level);
    const message = this.formatMessage(entry);
    
    if (entry.stack) {
      logMethod(message, entry.stack);
    } else {
      logMethod(message, entry.metadata);
    }
  }

  private getConsoleMethod(level: LogLevel) {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return console.error;
      default:
        return console.log;
    }
  }

  private formatMessage(entry: LogEntry): string {
    return `[${entry.timestamp}] [${LogLevel[entry.level]}] [${entry.category}] ${entry.message}`;
  }
}

/**
 * Remote Transport for production logging
 */
class RemoteTransport implements LogTransport {
  name = 'remote';
  private buffer: LogEntry[] = [];
  private flushInterval: number;
  private maxBufferSize = 100;
  private endpoint: string;

  constructor(endpoint: string, flushIntervalMs = 30000) {
    this.endpoint = endpoint;
    this.flushInterval = window.setInterval(() => {
      this.flush();
    }, flushIntervalMs);
  }

  async log(entry: LogEntry): Promise<void> {
    this.buffer.push(entry);
    
    if (this.buffer.length >= this.maxBufferSize || entry.level >= LogLevel.ERROR) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries,
          source: 'frontend',
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      });
    } catch (error) {
      // Fallback to console if remote logging fails
      console.error('Failed to send logs to remote endpoint:', error);
      entries.forEach(entry => {
        console.log('Buffered log:', entry);
      });
    }
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

/**
 * Local Storage Transport for offline logging
 */
class LocalStorageTransport implements LogTransport {
  name = 'localStorage';
  private storageKey = 'myk9show_logs';
  private maxEntries = 1000;

  async log(entry: LogEntry): Promise<void> {
    try {
      const existingLogs = this.getLogs();
      existingLogs.push(entry);
      
      // Keep only the most recent entries
      if (existingLogs.length > this.maxEntries) {
        existingLogs.splice(0, existingLogs.length - this.maxEntries);
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(existingLogs));
    } catch (error) {
      // LocalStorage might be full or unavailable
      console.warn('Failed to store log in localStorage:', error);
    }
  }

  getLogs(): LogEntry[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  clearLogs(): void {
    localStorage.removeItem(this.storageKey);
  }

  async flush(): Promise<void> {
    // For localStorage, logs are already persisted
    return Promise.resolve();
  }
}

/**
 * Main Logging Service
 */
export class LoggingService {
  private static instance: LoggingService;
  private transports: LogTransport[] = [];
  private minLevel: LogLevel = LogLevel.INFO;
  private sessionId: string;
  private userId?: string;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.setupTransports();
    this.setupErrorHandlers();
  }

  static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  private setupTransports(): void {
    // Console transport for development
    if (import.meta.env.DEV) {
      this.transports.push(new ConsoleTransport());
      this.minLevel = LogLevel.DEBUG;
    }

    // Remote transport for production
    if (import.meta.env.PROD && import.meta.env.VITE_LOG_ENDPOINT) {
      this.transports.push(new RemoteTransport(import.meta.env.VITE_LOG_ENDPOINT));
    }

    // Local storage transport for offline capability
    this.transports.push(new LocalStorageTransport());
  }

  private setupErrorHandlers(): void {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.error('Global Error', 'unhandled-error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', 'unhandled-promise', {
        reason: event.reason,
        stack: event.reason?.stack,
      });
    });
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  debug(message: string, category = 'general', metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, category, metadata);
  }

  info(message: string, category = 'general', metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, category, metadata);
  }

  warn(message: string, category = 'general', metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, category, metadata);
  }

  error(message: string, category = 'general', metadata?: Record<string, unknown>, error?: Error): void {
    const logMetadata = {
      ...metadata,
      stack: error?.stack,
    };
    this.log(LogLevel.ERROR, message, category, logMetadata);
  }

  fatal(message: string, category = 'general', metadata?: Record<string, unknown>, error?: Error): void {
    const logMetadata = {
      ...metadata,
      stack: error?.stack,
    };
    this.log(LogLevel.FATAL, message, category, logMetadata);
  }

  private async log(level: LogLevel, message: string, category: string, metadata?: Record<string, unknown>): Promise<void> {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      category,
      userId: this.userId,
      sessionId: this.sessionId,
      metadata,
      fingerprint: this.generateFingerprint(message, category, level),
    };

    // Add stack trace for errors
    if (level >= LogLevel.ERROR && !entry.stack && metadata?.stack) {
      entry.stack = metadata.stack as string;
    }

    // Send to all transports
    const promises = this.transports.map(transport => 
      transport.log(entry).catch(error => {
        console.error(`Transport ${transport.name} failed:`, error);
      })
    );

    await Promise.allSettled(promises);
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFingerprint(message: string, category: string, level: LogLevel): string {
    return `${category}-${LogLevel[level]}-${message.replace(/\d+/g, 'X').substring(0, 50)}`;
  }

  async flush(): Promise<void> {
    const promises = this.transports
      .filter(transport => transport.flush)
      .map(transport => transport.flush!());
    
    await Promise.allSettled(promises);
  }

  // Performance logging
  logPerformance(name: string, duration: number, metadata?: Record<string, unknown>): void {
    this.info(`Performance: ${name}`, 'performance', {
      duration,
      ...metadata,
    });
  }

  // User action logging
  logUserAction(action: string, target: string, metadata?: Record<string, unknown>): void {
    this.info(`User Action: ${action}`, 'user-action', {
      target,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  // API call logging
  logApiCall(method: string, url: string, status: number, duration: number, metadata?: Record<string, unknown>): void {
    const level = status >= 400 ? LogLevel.ERROR : LogLevel.INFO;
    this.log(level, `API Call: ${method} ${url}`, 'api', {
      method,
      url,
      status,
      duration,
      ...metadata,
    });
  }

  // Feature usage logging
  logFeatureUsage(feature: string, metadata?: Record<string, unknown>): void {
    this.info(`Feature Used: ${feature}`, 'feature-usage', metadata);
  }

  // Security event logging
  logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', metadata?: Record<string, unknown>): void {
    const level = severity === 'critical' ? LogLevel.FATAL : 
                  severity === 'high' ? LogLevel.ERROR :
                  severity === 'medium' ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(level, `Security Event: ${event}`, 'security', {
      severity,
      ...metadata,
    });
  }

  // Get local logs for debugging
  getLocalLogs(): LogEntry[] {
    const localTransport = this.transports.find(t => t instanceof LocalStorageTransport) as LocalStorageTransport;
    return localTransport ? localTransport.getLogs() : [];
  }

  // Clear local logs
  clearLocalLogs(): void {
    const localTransport = this.transports.find(t => t instanceof LocalStorageTransport) as LocalStorageTransport;
    if (localTransport) {
      localTransport.clearLogs();
    }
  }

  destroy(): void {
    this.transports.forEach(transport => {
      if ('destroy' in transport && typeof transport.destroy === 'function') {
        transport.destroy();
      }
    });
  }
}

// Export singleton instance
export const logger = LoggingService.getInstance();