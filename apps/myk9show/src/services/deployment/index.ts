/**
 * Deployment Services Index
 * 
 * Central export point for all deployment-related services and utilities.
 */

// Core Services
export { DeploymentManager } from './DeploymentManager';
export { FeatureFlagService } from './FeatureFlagService';
export { ProductionMonitoringService } from './ProductionMonitoringService';
export { CDNService } from './CDNService';

// Import for internal use
import { DeploymentManager } from './DeploymentManager';
import { FeatureFlagService } from './FeatureFlagService';
import { ProductionMonitoringService } from './ProductionMonitoringService';
import { CDNService } from './CDNService';

// Types
export type {
  DeploymentConfig,
  DeploymentChecklist,
  MigrationTask,
  RLSPolicy,
  FeatureFlagConfig,
  DeploymentStatus,
  ChecklistTask,
  TaskStatus,
  DeploymentEvent,
  HealthCheckConfig,
  HealthCheckResult,
  RollbackPlan,
  LoadTestConfig,
  DisasterRecoveryPlan,
  DeploymentEnvironment,
  MigrationStatus,
  RiskLevel,
  TargetAudience,
  FeatureCondition,
  UserType,
  MonitoringConfig,
  ErrorTrackingConfig,
  PerformanceMonitoringConfig,
  UserAnalyticsConfig,
  CustomMetricConfig,
  AlertThreshold,
  NotificationChannel,
  MetricType,
  Severity
} from '../../types/deployment-types';

// Feature Flag Context and Types
export type {
  FeatureFlagContext,
  FeatureFlagMetrics,
  ABTestConfig,
  ABTestVariant,
  SuccessMetric,
  SegmentationRule
} from './FeatureFlagService';

// Monitoring Types
export type {
  ErrorReport,
  ErrorContext,
  Breadcrumb,
  PerformanceMetric,
  WebVitalsReport,
  TransactionTrace,
  TraceSpan,
  SpanLog,
  UserEvent,
  DeviceInfo,
  LocationInfo,
  UserSession,
  AlertRule,
  AlertCondition,
  Alert
} from './ProductionMonitoringService';

// CDN Types
export type {
  CDNConfig,
  AssetOptions,
  UploadOptions,
  UploadResult,
  BatchUploadResult,
  InvalidationResult,
  PreloadResult,
  CachingRule,
  CacheStats,
  CDNAnalytics,
  AnalyticsTimeRange
} from './CDNService';

// Utility Functions
export const deploymentUtils = {
  /**
   * Get deployment manager instance
   */
  getDeploymentManager: () => DeploymentManager.getInstance(),
  
  /**
   * Get feature flag service instance
   */
  getFeatureFlagService: () => FeatureFlagService.getInstance(),
  
  /**
   * Get production monitoring service instance
   */
  getMonitoringService: () => ProductionMonitoringService.getInstance(),
  
  /**
   * Get CDN service instance
   */
  getCDNService: () => CDNService.getInstance(),
  
  /**
   * Check if a feature is enabled for a user
   */
  isFeatureEnabled: (flagId: string, context: Record<string, unknown> = {}) => {
    const service = FeatureFlagService.getInstance();
    return service.isEnabled(flagId, context);
  },
  
  /**
   * Report an error to monitoring
   */
  reportError: (error: Error, context?: Record<string, unknown>) => {
    const service = ProductionMonitoringService.getInstance();
    return service.reportError(error, context);
  },
  
  /**
   * Track a user event
   */
  trackEvent: (event: string, properties: Record<string, unknown> = {}, userId?: string) => {
    const service = ProductionMonitoringService.getInstance();
    service.trackEvent(event, properties, userId);
  },
  
  /**
   * Record a performance metric
   */
  recordMetric: (name: string, value: number, type: 'counter' | 'gauge' | 'histogram' | 'summary' = 'gauge') => {
    const service = ProductionMonitoringService.getInstance();
    service.recordMetric(name, value, type);
  }
};

// Configuration Presets
export const deploymentPresets = {
  development: {
    errorTracking: {
      provider: 'sentry' as const,
      environment: 'development',
      sampleRate: 1.0,
      enableSourceMaps: true
    },
    featureFlags: {
      defaultRolloutPercentage: 100,
      enableABTesting: true,
      quickRollback: true
    },
    monitoring: {
      enableWebVitals: true,
      trackUserEvents: true,
      alertThresholds: {
        errorRate: 0.1,
        responseTime: 5000
      }
    }
  },
  
  staging: {
    errorTracking: {
      provider: 'sentry' as const,
      environment: 'staging',
      sampleRate: 1.0,
      enableSourceMaps: true
    },
    featureFlags: {
      defaultRolloutPercentage: 50,
      enableABTesting: true,
      quickRollback: true
    },
    monitoring: {
      enableWebVitals: true,
      trackUserEvents: true,
      alertThresholds: {
        errorRate: 0.05,
        responseTime: 3000
      }
    }
  },
  
  production: {
    errorTracking: {
      provider: 'sentry' as const,
      environment: 'production',
      sampleRate: 0.1,
      enableSourceMaps: false
    },
    featureFlags: {
      defaultRolloutPercentage: 5,
      enableABTesting: true,
      quickRollback: true
    },
    monitoring: {
      enableWebVitals: true,
      trackUserEvents: true,
      alertThresholds: {
        errorRate: 0.01,
        responseTime: 2000
      }
    }
  }
} as const;

// React hooks for components (conditionally exported for browser environments)
export const createDeploymentHooks = () => {
  if (typeof window === 'undefined') {
    // Server-side or non-browser environment
    return {
      useDeployment: () => DeploymentManager.getInstance(),
      useFeatureFlag: () => false,
      useMonitoring: () => ({
        reportError: () => '',
        trackEvent: () => {},
        recordMetric: () => {},
        getDashboardData: () => ({
          errors: { total: 0, recent: 0, byLevel: {}, topErrors: [] },
          performance: { avgResponseTime: 0, errorRate: 0, throughput: 0, webVitals: { fcp: 0, lcp: 0, fid: 0, cls: 0 } },
          users: { activeUsers: 0, totalSessions: 0, avgSessionDuration: 0, topEvents: [] },
          alerts: { active: 0, acknowledged: 0, resolved: 0, recent: [] }
        })
      })
    };
  }

  // Browser environment with React
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useState, useEffect, useCallback } = require('react');
    
    return {
      useDeployment: () => {
        const [deploymentManager] = useState(() => DeploymentManager.getInstance());
        return deploymentManager;
      },

      useFeatureFlag: (flagId: string, context: Record<string, unknown> = {}) => {
        const [service] = useState(() => FeatureFlagService.getInstance());
        const [isEnabled, setIsEnabled] = useState(false);
        
        useEffect(() => {
          const checkFlag = () => {
            setIsEnabled(service.isEnabled(flagId, context));
          };
          
          checkFlag();
          
          // Re-check every 30 seconds
          const interval = setInterval(checkFlag, 30000);
          return () => clearInterval(interval);
        }, [flagId, context, service]);
        
        return isEnabled;
      },

      useMonitoring: () => {
        const [service] = useState(() => ProductionMonitoringService.getInstance());
        
        const reportError = useCallback((error: Error, context?: Record<string, unknown>) => {
          return service.reportError(error, context);
        }, [service]);
        
        const trackEvent = useCallback((event: string, properties?: Record<string, unknown>, userId?: string) => {
          service.trackEvent(event, properties, userId);
        }, [service]);
        
        const recordMetric = useCallback((name: string, value: number, type?: 'counter' | 'gauge' | 'histogram' | 'summary') => {
          service.recordMetric(name, value, type);
        }, [service]);
        
        return {
          reportError,
          trackEvent,
          recordMetric,
          getDashboardData: () => service.getDashboardData()
        };
      }
    };
  } catch {
    // React not available, return non-reactive versions
    return {
      useDeployment: () => DeploymentManager.getInstance(),
      useFeatureFlag: (flagId: string, context: Record<string, unknown> = {}) => FeatureFlagService.getInstance().isEnabled(flagId, context),
      useMonitoring: () => {
        const service = ProductionMonitoringService.getInstance();
        return {
          reportError: (error: Error, context?: Record<string, unknown>) => service.reportError(error, context),
          trackEvent: (event: string, properties?: Record<string, unknown>, userId?: string) => service.trackEvent(event, properties, userId),
          recordMetric: (name: string, value: number, type?: 'counter' | 'gauge' | 'histogram' | 'summary') => service.recordMetric(name, value, type),
          getDashboardData: () => service.getDashboardData()
        };
      }
    };
  }
};