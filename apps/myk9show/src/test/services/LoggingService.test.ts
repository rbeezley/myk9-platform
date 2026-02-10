import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoggingService, LogLevel, LogTransport, LogEntry } from '@/services/LoggingService';

// Mock window APIs
const mockSetInterval = vi.fn();
const mockClearInterval = vi.fn();
const mockFetch = vi.fn();
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

// Mock environment variables
vi.mock('import.meta', () => ({
  env: {
    DEV: false,
    PROD: true,
    VITE_LOG_ENDPOINT: 'https://api.example.com/logs'
  }
}));

// Setup global mocks
Object.assign(global, {
  window: {
    setInterval: mockSetInterval,
    clearInterval: mockClearInterval,
    addEventListener: vi.fn(),
    location: { href: 'https://example.com' },
    navigator: { userAgent: 'test-agent' }
  },
  fetch: mockFetch,
  localStorage: mockLocalStorage,
  console: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn()
  }
});

describe('LoggingService', () => {
  let logger: LoggingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockFetch.mockResolvedValue({ ok: true });
    
    // Reset singleton
    (LoggingService as unknown as { instance: LoggingService }).instance = undefined as unknown as LoggingService;
    logger = LoggingService.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const logger1 = LoggingService.getInstance();
      const logger2 = LoggingService.getInstance();
      
      expect(logger1).toBe(logger2);
    });

    it('should create a unique session ID', () => {
      const logger1 = LoggingService.getInstance();
      (LoggingService as unknown as { instance: LoggingService }).instance = undefined as unknown as LoggingService;
      const logger2 = LoggingService.getInstance();
      
      // Access private sessionId through log metadata
      logger1.info('test1', 'test');
      logger2.info('test2', 'test');
      
      // Session IDs should be different for different instances
      expect(logger1).not.toBe(logger2);
    });
  });

  describe('Log Level Management', () => {
    it('should set minimum log level', () => {
      logger.setMinLevel(LogLevel.WARN);
      
      // Mock console to verify calls
      const consoleSpy = vi.spyOn(console, 'info');
      
      logger.info('This should not be logged', 'test');
      logger.warn('This should be logged', 'test');
      
      // Info should not be called due to min level being WARN
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should respect default minimum level', () => {
      // In dev mode (vitest sets import.meta.env.DEV = true), default is DEBUG
      // so debug messages should be logged
      const consoleSpy = vi.spyOn(console, 'debug');

      logger.debug('Debug message', 'test');

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('User Context', () => {
    it('should set and use user ID', () => {
      const userId = 'test-user-123';
      logger.setUserId(userId);
      
      const consoleSpy = vi.spyOn(console, 'info');
      logger.info('Test message with user', 'test');
      
      expect(consoleSpy).toHaveBeenCalled();
      // User ID should be included in log metadata (implementation detail)
    });
  });

  describe('Log Methods', () => {
    it('should log debug messages', () => {
      logger.setMinLevel(LogLevel.DEBUG);
      const consoleSpy = vi.spyOn(console, 'debug');
      
      logger.debug('Debug message', 'test-category', { key: 'value' });
      
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      const consoleSpy = vi.spyOn(console, 'info');
      
      logger.info('Info message', 'test-category', { key: 'value' });
      
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log warning messages', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      
      logger.warn('Warning message', 'test-category', { key: 'value' });
      
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const testError = new Error('Test error');
      
      logger.error('Error message', 'test-category', { key: 'value' }, testError);
      
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log fatal messages', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const testError = new Error('Fatal error');
      
      logger.fatal('Fatal message', 'test-category', { key: 'value' }, testError);
      
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log performance metrics', () => {
      const consoleSpy = vi.spyOn(console, 'info');
      
      logger.logPerformance('api-call', 150, { endpoint: '/api/dogs' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Performance: api-call'),
        expect.objectContaining({ duration: 150 })
      );
    });

    it('should log user actions', () => {
      const consoleSpy = vi.spyOn(console, 'info');
      
      logger.logUserAction('click', 'submit-button', { formId: 'dog-form' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('User Action: click'),
        expect.objectContaining({ target: 'submit-button' })
      );
    });

    it('should log API calls with appropriate level', () => {
      const infoSpy = vi.spyOn(console, 'info');
      const errorSpy = vi.spyOn(console, 'error');
      
      // Successful API call
      logger.logApiCall('GET', '/api/dogs', 200, 120);
      expect(infoSpy).toHaveBeenCalled();
      
      // Failed API call
      logger.logApiCall('POST', '/api/dogs', 500, 200);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should log feature usage', () => {
      const consoleSpy = vi.spyOn(console, 'info');
      
      logger.logFeatureUsage('offline-scoring', { scoreCount: 5 });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Feature Used: offline-scoring'),
        expect.objectContaining({ scoreCount: 5 })
      );
    });

    it('should log security events with correct severity', () => {
      const infoSpy = vi.spyOn(console, 'info');
      const warnSpy = vi.spyOn(console, 'warn');
      const errorSpy = vi.spyOn(console, 'error');
      
      logger.logSecurityEvent('login-attempt', 'low', { userId: 'test' });
      expect(infoSpy).toHaveBeenCalled();
      
      logger.logSecurityEvent('suspicious-activity', 'medium', { ip: '192.168.1.1' });
      expect(warnSpy).toHaveBeenCalled();
      
      logger.logSecurityEvent('data-breach', 'high', { affected: 100 });
      expect(errorSpy).toHaveBeenCalled();
      
      logger.logSecurityEvent('system-compromise', 'critical', { severity: 'max' });
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('LocalStorage Integration', () => {
    it('should retrieve local logs', () => {
      const mockLogs = [
        {
          timestamp: '2024-01-01T00:00:00.000Z',
          level: LogLevel.INFO,
          message: 'Test log',
          category: 'test'
        }
      ];
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockLogs));
      
      const logs = logger.getLocalLogs();
      
      expect(logs).toEqual(mockLogs);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('myk9show_logs');
    });

    it('should clear local logs', () => {
      logger.clearLocalLogs();
      
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('myk9show_logs');
    });

    it('should handle localStorage errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('LocalStorage error');
      });
      
      const logs = logger.getLocalLogs();
      
      expect(logs).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle transport failures gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error');
      
      // Create a failing transport
      const failingTransport: LogTransport = {
        name: 'failing',
        log: vi.fn().mockRejectedValue(new Error('Transport failed'))
      };
      
      // Access private transports to add failing transport
      (logger as unknown as { transports: unknown[] }).transports.push(failingTransport);
      
      logger.info('Test message', 'test');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(errorSpy).toHaveBeenCalledWith(
        'Transport failing failed:',
        expect.any(Error)
      );
    });

    it('should generate consistent fingerprints', () => {
      const message1 = 'Error with ID 123';
      const message2 = 'Error with ID 456';
      const category = 'api-error';
      
      // Access private method through unknown type
      const fingerprint1 = (logger as unknown as { generateFingerprint: (msg: string, cat: string, level: number) => string }).generateFingerprint(message1, category, LogLevel.ERROR);
      const fingerprint2 = (logger as unknown as { generateFingerprint: (msg: string, cat: string, level: number) => string }).generateFingerprint(message2, category, LogLevel.ERROR);
      
      // Fingerprints should be similar (numbers replaced with X)
      expect(fingerprint1).toContain('api-error-ERROR-Error with ID X');
      expect(fingerprint2).toContain('api-error-ERROR-Error with ID X');
      expect(fingerprint1).toBe(fingerprint2);
    });
  });

  describe('Flush Operations', () => {
    it('should flush all transports', async () => {
      const flushSpy = vi.fn().mockResolvedValue(undefined);
      
      // Create transport with flush method
      const flushableTransport: LogTransport = {
        name: 'flushable',
        log: vi.fn(),
        flush: flushSpy
      };
      
      (logger as unknown as { transports: unknown[] }).transports.push(flushableTransport);
      
      await logger.flush();
      
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should handle flush failures gracefully', async () => {
      const flushSpy = vi.fn().mockRejectedValue(new Error('Flush failed'));
      
      const flushableTransport: LogTransport = {
        name: 'flushable',
        log: vi.fn(),
        flush: flushSpy
      };
      
      (logger as unknown as { transports: unknown[] }).transports.push(flushableTransport);
      
      // Should not throw
      await expect(logger.flush()).resolves.toBeUndefined();
    });
  });

  describe('Destroy Operations', () => {
    it('should destroy all transports', () => {
      const destroySpy = vi.fn();
      
      const destroyableTransport = {
        name: 'destroyable',
        log: vi.fn(),
        destroy: destroySpy
      };
      
      (logger as unknown as { transports: unknown[] }).transports.push(destroyableTransport);
      
      logger.destroy();
      
      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('Global Error Handlers', () => {
    it('should set up error event listeners', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      // Create new instance to trigger setup
      (LoggingService as unknown as { instance: LoggingService }).instance = undefined as unknown as LoggingService;
      LoggingService.getInstance();
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    });
  });
});

describe('LogTransport Implementations', () => {
  let logger: LoggingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockFetch.mockResolvedValue({ ok: true });

    // Reset singleton
    (LoggingService as unknown as { instance: LoggingService }).instance = undefined as unknown as LoggingService;
    logger = LoggingService.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ConsoleTransport', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should format messages correctly', async () => {
      const consoleSpy = vi.spyOn(console, 'info');
      
      // Access ConsoleTransport through logger
      logger.info('Test message', 'test-category', { key: 'value' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.objectContaining({ key: 'value' })
      );
    });

    it('should use correct console methods for different levels', () => {
      const debugSpy = vi.spyOn(console, 'debug');
      const infoSpy = vi.spyOn(console, 'info');
      const warnSpy = vi.spyOn(console, 'warn');
      const errorSpy = vi.spyOn(console, 'error');
      
      logger.setMinLevel(LogLevel.DEBUG);
      
      logger.debug('Debug', 'test');
      logger.info('Info', 'test');
      logger.warn('Warning', 'test');
      logger.error('Error', 'test');
      logger.fatal('Fatal', 'test');
      
      expect(debugSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(2); // error and fatal both use console.error
    });
  });

  describe('LocalStorageTransport', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockLocalStorage.getItem.mockReturnValue(null);
    });

    it('should store logs in localStorage', () => {
      logger.info('Test message', 'test');
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'myk9show_logs',
        expect.stringContaining('Test message')
      );
    });

    it('should handle localStorage quota exceeded', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      
      const warnSpy = vi.spyOn(console, 'warn');
      
      // Should not throw
      expect(() => logger.info('Test message', 'test')).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to store log in localStorage:',
        expect.any(Error)
      );
    });

    it('should limit stored entries', () => {
      const existingLogs = new Array(1000).fill(null).map((_, i) => ({
        timestamp: '2024-01-01T00:00:00.000Z',
        level: LogLevel.INFO,
        message: `Message ${i}`,
        category: 'test'
      }));
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(existingLogs));
      
      logger.info('New message', 'test');
      
      const setItemCall = mockLocalStorage.setItem.mock.calls[0];
      const storedLogs = JSON.parse(setItemCall[1]);
      
      expect(storedLogs.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('RemoteTransport', () => {
    let savedDEV: boolean;
    let savedPROD: boolean;
    let savedEndpoint: string | undefined;

    beforeEach(() => {
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({ ok: true });

      // Save original env values
      savedDEV = import.meta.env.DEV;
      savedPROD = import.meta.env.PROD;
      savedEndpoint = import.meta.env.VITE_LOG_ENDPOINT;

      // Set production environment with log endpoint so RemoteTransport is created
      import.meta.env.DEV = false;
      import.meta.env.PROD = true;
      import.meta.env.VITE_LOG_ENDPOINT = 'https://api.example.com/logs';

      // Reset singleton so it picks up the new env
      (LoggingService as unknown as { instance: LoggingService }).instance = undefined as unknown as LoggingService;
      logger = LoggingService.getInstance();
    });

    afterEach(() => {
      // Restore original env values
      import.meta.env.DEV = savedDEV;
      import.meta.env.PROD = savedPROD;
      if (savedEndpoint === undefined) {
        delete import.meta.env.VITE_LOG_ENDPOINT;
      } else {
        import.meta.env.VITE_LOG_ENDPOINT = savedEndpoint;
      }
    });

    it('should send logs to remote endpoint', async () => {
      logger.error('Critical error', 'test'); // Error level triggers immediate flush

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/logs',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Critical error')
        })
      );
    });

    it('should handle remote endpoint failures', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error');

      logger.error('Critical error', 'test');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send logs to remote endpoint:',
        expect.any(Error)
      );
    });
  });
});

describe('Integration Tests', () => {
  let logger: LoggingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockFetch.mockResolvedValue({ ok: true });

    // Reset singleton
    (LoggingService as unknown as { instance: LoggingService }).instance = undefined as unknown as LoggingService;
    logger = LoggingService.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should work with multiple transports simultaneously', () => {
    const consoleSpy = vi.spyOn(console, 'info');
    
    logger.info('Multi-transport test', 'integration');
    
    // Should hit console transport
    expect(consoleSpy).toHaveBeenCalled();
    
    // Should hit localStorage transport
    expect(mockLocalStorage.setItem).toHaveBeenCalled();
  });

  it('should maintain session context across logs', () => {
    logger.setUserId('test-user');
    
    logger.info('First message', 'test');
    logger.warn('Second message', 'test');
    
    // Both logs should have the same session/user context
    const setItemCalls = mockLocalStorage.setItem.mock.calls;
    expect(setItemCalls.length).toBeGreaterThan(0);
    
    const logs = setItemCalls.map(call => JSON.parse(call[1]));
    logs.forEach(logArray => {
      logArray.forEach((log: LogEntry) => {
        expect(log.userId).toBe('test-user');
        expect(log.sessionId).toBeDefined();
      });
    });
  });
});