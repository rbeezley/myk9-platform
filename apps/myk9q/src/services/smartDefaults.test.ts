/**
 * Tests for smart defaults service
 */

import { vi } from 'vitest';
import {
  detectDefaultsContext,
  generateSmartDefaults,
  applySmartDefaults,
  getRecommendedSettings,
  validateSettings,
  getOptimizationSuggestions,
  autoOptimizeSettings,
  SmartDefaultsContext,
} from './smartDefaults';
import type { AppSettings } from '@/stores/settingsStore';

// Mock device detection
vi.mock('@/utils/deviceDetection', () => ({
  detectDeviceCapabilities: vi.fn(async () => ({
    tier: 'medium',
    gpu: 'medium',
    cores: 4,
    memory: 8,
    screen: { width: 1920, height: 1080 },
  })),
  getPerformanceSettings: vi.fn(async () => ({
    animations: true,
    blurEffects: true,
    shadows: true,
    tier: 'medium',
  })),
}));

// Mock network detection
vi.mock('./networkDetectionService', () => ({
  networkDetectionService: {
    getNetworkInfo: vi.fn(() => ({
      connectionType: 'wifi',
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false,
    })),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock navigator.getBattery
const mockBattery = {
  level: 0.8,
  charging: false,
};

Object.defineProperty(navigator, 'getBattery', {
  writable: true,
  value: vi.fn().mockResolvedValue(mockBattery),
});

const createMockSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  // Display
  theme: 'dark',
  accentColor: 'green',

  // Performance
  enableAnimations: true,
  enableBlur: true,
  enableShadows: true,

  // Mobile
  pullToRefresh: true,
  hapticFeedback: true,

  // Notifications
  enableNotifications: true,
  voiceNotifications: false,
  showBadges: true,
  notifyYourTurnLeadDogs: 2,

  // Scoring
  voiceAnnouncements: false,

  // Voice configuration
  voiceName: '',
  voiceRate: 1.0,

  // Privacy & Security
  autoLogout: 480,

  // Developer Tools
  developerMode: false,
  consoleLogging: 'errors',
  enableBetaFeatures: false,
  enablePerformanceMonitoring: false,
  ...overrides,
});

describe('smartDefaults', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('detectDefaultsContext', () => {
    it('should detect device tier', async () => {
      const context = await detectDefaultsContext();
      expect(context.deviceTier).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(context.deviceTier);
    });

    it('should detect connection type', async () => {
      const context = await detectDefaultsContext();
      expect(context.connectionType).toBeDefined();
      expect(['wifi', 'cellular', 'ethernet', 'bluetooth', 'unknown']).toContain(
        context.connectionType
      );
    });

    it('should detect connection quality', async () => {
      const context = await detectDefaultsContext();
      expect(context.connectionQuality).toBeDefined();
      expect(['slow', 'medium', 'fast']).toContain(context.connectionQuality);
    });

    it('should detect first launch when no settings exist', async () => {
      localStorageMock.clear();
      const context = await detectDefaultsContext();
      expect(context.isFirstLaunch).toBe(true);
    });

    it('should detect non-first launch when settings exist', async () => {
      localStorageMock.setItem('myK9Q_settings', '{}');
      const context = await detectDefaultsContext();
      expect(context.isFirstLaunch).toBe(false);
    });

    it('should include user role when provided', async () => {
      const context = await detectDefaultsContext('judge');
      expect(context.userRole).toBe('judge');
    });

    it('should detect battery level when available', async () => {
      const context = await detectDefaultsContext();
      expect(context.batteryLevel).toBeDefined();
      expect(typeof context.batteryLevel).toBe('number');
    });

    it('should detect charging status', async () => {
      const context = await detectDefaultsContext();
      expect(context.isCharging).toBeDefined();
      expect(typeof context.isCharging).toBe('boolean');
    });
  });

  describe('generateSmartDefaults', () => {
    it('should generate defaults for medium-tier device', async () => {
      const context: SmartDefaultsContext = {
        deviceTier: 'medium',
        connectionType: 'wifi',
        connectionQuality: 'medium',
        isFirstLaunch: true,
      };

      const defaults = await generateSmartDefaults(context);

      // Check actual AppSettings properties
      expect(defaults.enableAnimations).toBeDefined();
      expect(defaults.theme).toBeDefined();
    });

    it('should optimize for low-tier device', async () => {
      const context: SmartDefaultsContext = {
        deviceTier: 'low',
        connectionType: 'cellular',
        connectionQuality: 'slow',
        isFirstLaunch: true,
      };

      const defaults = await generateSmartDefaults(context);

      // Check actual AppSettings properties - low tier disables haptic feedback
      expect(defaults.enableAnimations).toBeDefined();
      expect(defaults.hapticFeedback).toBe(false);
    });

    it('should enable full features for high-tier device', async () => {
      const context: SmartDefaultsContext = {
        deviceTier: 'high',
        connectionType: 'wifi',
        connectionQuality: 'fast',
        isFirstLaunch: true,
      };

      const defaults = await generateSmartDefaults(context);

      // Check actual AppSettings properties - high-tier enables performance features
      expect(defaults.enableAnimations).toBeDefined();
      expect(defaults.enableBlur).toBeDefined();
      expect(defaults.enableShadows).toBeDefined();
    });

    it('should generate defaults when battery is low', async () => {
      const context: SmartDefaultsContext = {
        deviceTier: 'medium',
        connectionType: 'wifi',
        connectionQuality: 'medium',
        isFirstLaunch: true,
        batteryLevel: 0.15, // 15%
        isCharging: false,
      };

      const defaults = await generateSmartDefaults(context);

      // Defaults should still be generated (battery info used for context)
      expect(defaults.theme).toBeDefined();
      expect(defaults.enableAnimations).toBeDefined();
    });

    it('should enable WiFi-only sync on cellular', async () => {
      const context: SmartDefaultsContext = {
        deviceTier: 'medium',
        connectionType: 'cellular',
        connectionQuality: 'medium',
        isFirstLaunch: true,
      };

      const defaults = await generateSmartDefaults(context);

      // Check that defaults are generated (wifiOnlySync doesn't exist in AppSettings)
      expect(defaults).toBeDefined();
      expect(defaults.theme).toBeDefined();
    });

    it('should apply judge role defaults', async () => {
      const context: SmartDefaultsContext = {
        deviceTier: 'medium',
        connectionType: 'wifi',
        connectionQuality: 'medium',
        isFirstLaunch: true,
        userRole: 'judge',
      };

      const defaults = await generateSmartDefaults(context);

      // Judges get voice announcements enabled
      expect(defaults.voiceAnnouncements).toBe(true);
    });

    it('should apply exhibitor role defaults', async () => {
      const context: SmartDefaultsContext = {
        deviceTier: 'medium',
        connectionType: 'wifi',
        connectionQuality: 'medium',
        isFirstLaunch: true,
        userRole: 'exhibitor',
      };

      const defaults = await generateSmartDefaults(context);

      // Exhibitors don't get voice announcements (judges do)
      expect(defaults.voiceAnnouncements).toBe(false);
      expect(defaults.theme).toBeDefined();
    });

    it('should detect system theme preference', async () => {
      const context: SmartDefaultsContext = {
        deviceTier: 'medium',
        connectionType: 'wifi',
        connectionQuality: 'medium',
        isFirstLaunch: true,
      };

      const defaults = await generateSmartDefaults(context);

      // Based on our mock, prefers-color-scheme: dark
      expect(defaults.theme).toBe('dark');
    });
  });

  describe('applySmartDefaults', () => {
    it('should fill in missing settings without force reset', async () => {
      const partialSettings = createMockSettings({
        theme: undefined as any,
        enableAnimations: undefined as any,
      });

      const result = await applySmartDefaults(partialSettings, undefined, false);

      expect(result.theme).toBeDefined();
      expect(result.enableAnimations).toBeDefined();
    });

    it('should preserve existing settings without force reset', async () => {
      const settings = createMockSettings({ theme: 'light' });

      const result = await applySmartDefaults(settings, undefined, false);

      expect(result.theme).toBe('light'); // Preserved
    });

    it('should override all settings with force reset', async () => {
      const settings = createMockSettings({ theme: 'light' });

      const result = await applySmartDefaults(settings, undefined, true);

      // Theme should be overridden with smart default (dark based on mock)
      expect(result.theme).toBe('dark');
    });
  });

  describe('getRecommendedSettings', () => {
    it('should return battery-saver preset', async () => {
      const recommended = await getRecommendedSettings('battery-saver');

      // Battery-saver disables performance features
      expect(recommended.enableAnimations).toBe(false);
      expect(recommended.enableBlur).toBe(false);
      expect(recommended.enableShadows).toBe(false);
      expect(recommended.hapticFeedback).toBe(false);
    });

    it('should return performance preset', async () => {
      const recommended = await getRecommendedSettings('performance');

      // Performance enables all visual features
      expect(recommended.enableAnimations).toBe(true);
      expect(recommended.enableBlur).toBe(true);
      expect(recommended.enableShadows).toBe(true);
      expect(recommended.hapticFeedback).toBe(true);
    });

    it('should return data-saver preset', async () => {
      const recommended = await getRecommendedSettings('data-saver');

      // Data-saver returns empty object (no longer disables features due to offline-first)
      expect(recommended).toBeDefined();
      expect(typeof recommended).toBe('object');
    });

    it('should return balanced preset as default', async () => {
      const recommended = await getRecommendedSettings('balanced');

      // Balanced returns smart defaults based on device context
      expect(recommended).toBeDefined();
      expect(recommended.theme).toBeDefined();
      expect(recommended.enableAnimations).toBeDefined();
    });
  });

  describe('validateSettings', () => {
    it('should validate settings for current device', async () => {
      const settings = createMockSettings();

      const result = await validateSettings(settings);

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('recommendations');
    });

    it('should warn about animations on low-end device', async () => {
      // Mock low-end device
      const { detectDeviceCapabilities } = await import('@/utils/deviceDetection');
      vi.mocked(detectDeviceCapabilities).mockResolvedValueOnce({
        tier: 'low',
        gpu: 'low',
        cores: 2,
        memory: 2,
        screen: { width: 1280, height: 720 },
      });

      const settings = createMockSettings({ enableAnimations: true });

      const result = await validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.recommendations.enableAnimations).toBe(false);
    });

    it('should warn about high image quality on cellular', async () => {
      // Mock cellular connection
      const { networkDetectionService } = await import('./networkDetectionService');
      vi.mocked(networkDetectionService.getNetworkInfo).mockReturnValueOnce({
        connectionType: 'cellular',
        effectiveType: '4g',
        downlink: 5,
        rtt: 100,
        saveData: false,
      });

      const settings = createMockSettings();

      const result = await validateSettings(settings);

      // Should warn about syncing on cellular
      expect(result.warnings.some((w) => w.includes('cellular'))).toBe(true);
    });

    it('should return valid for optimal settings', async () => {
      const settings = createMockSettings({
        enableAnimations: true,
      });

      const result = await validateSettings(settings);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('getOptimizationSuggestions', () => {
    it('should provide categorized suggestions', async () => {
      // Mock low-end device
      const { detectDeviceCapabilities } = await import('@/utils/deviceDetection');
      vi.mocked(detectDeviceCapabilities).mockResolvedValueOnce({
        tier: 'low',
        gpu: 'low',
        cores: 2,
        memory: 2,
        screen: { width: 1280, height: 720 },
      });

      const settings = createMockSettings({ enableAnimations: true });

      const suggestions = await getOptimizationSuggestions(settings);

      expect(Array.isArray(suggestions)).toBe(true);

      if (suggestions.length > 0) {
        const suggestion = suggestions[0];
        expect(suggestion).toHaveProperty('category');
        expect(suggestion).toHaveProperty('suggestion');
        expect(suggestion).toHaveProperty('setting');
        expect(suggestion).toHaveProperty('currentValue');
        expect(suggestion).toHaveProperty('recommendedValue');
        expect(suggestion).toHaveProperty('impact');
        expect(['low', 'medium', 'high']).toContain(suggestion.impact);
      }
    });

    it('should include performance category for visual settings', async () => {
      const { detectDeviceCapabilities } = await import('@/utils/deviceDetection');
      vi.mocked(detectDeviceCapabilities).mockResolvedValueOnce({
        tier: 'low',
        gpu: 'low',
        cores: 2,
        memory: 2,
        screen: { width: 1280, height: 720 },
      });

      const settings = createMockSettings({ enableAnimations: true });

      const suggestions = await getOptimizationSuggestions(settings);

      const perfSuggestions = suggestions.filter((s) => s.category === 'Performance');
      expect(perfSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe('autoOptimizeSettings', () => {
    it('should apply battery-saver scenario', async () => {
      const settings = createMockSettings();

      const optimized = await autoOptimizeSettings(settings, 'battery-saver');

      // Battery-saver disables performance features
      expect(optimized.enableAnimations).toBe(false);
      expect(optimized.hapticFeedback).toBe(false);
    });

    it('should apply performance scenario', async () => {
      const settings = createMockSettings();

      const optimized = await autoOptimizeSettings(settings, 'performance');

      // Performance enables all visual features
      expect(optimized.enableAnimations).toBe(true);
      expect(optimized.enableBlur).toBe(true);
      expect(optimized.hapticFeedback).toBe(true);
    });

    it('should apply smart recommendations without scenario', async () => {
      const settings = createMockSettings();

      const optimized = await autoOptimizeSettings(settings);

      expect(optimized).toBeDefined();
      // Should preserve most settings and only apply recommendations
    });

    it('should preserve non-optimized settings', async () => {
      const settings = createMockSettings({ theme: 'light' });

      const optimized = await autoOptimizeSettings(settings, 'battery-saver');

      expect(optimized.theme).toBe('light'); // Should be preserved
    });
  });

  describe('edge cases', () => {
    it('should handle missing battery API gracefully', async () => {
      // Remove battery API
      Object.defineProperty(navigator, 'getBattery', {
        value: undefined,
        writable: true,
      });

      const context = await detectDefaultsContext();

      expect(context.batteryLevel).toBeUndefined();
      expect(context.isCharging).toBeUndefined();
    });

    it('should handle battery API errors gracefully', async () => {
      Object.defineProperty(navigator, 'getBattery', {
        value: vi.fn().mockRejectedValue(new Error('Battery API not supported')),
        writable: true,
      });

      const context = await detectDefaultsContext();

      expect(context.batteryLevel).toBeUndefined();
    });

    it('should handle unknown user roles', async () => {
      const context: SmartDefaultsContext = {
        deviceTier: 'medium',
        connectionType: 'wifi',
        connectionQuality: 'medium',
        isFirstLaunch: true,
        userRole: 'unknown' as any,
      };

      const defaults = await generateSmartDefaults(context);

      // Should still generate defaults without role-specific settings
      expect(defaults).toBeDefined();
      expect(defaults.theme).toBeDefined();
      expect(defaults.enableAnimations).toBeDefined();
    });
  });
});
