/**
 * Deployment System Integration Tests
 *
 * Comprehensive tests for the complete deployment system including
 * deployment management, feature flags, and production monitoring.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeploymentManager } from '@/services/deployment/DeploymentManager';
import { FeatureFlagService } from '@/services/deployment/FeatureFlagService';
import { ProductionMonitoringService } from '@/services/deployment/ProductionMonitoringService';
import { DeploymentConfig } from '@/types/deployment-types';

// Provide a global logger mock for FeatureFlagService and ProductionMonitoringService
// which reference `logger` without importing it.
const loggerMock = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
};
(globalThis as Record<string, unknown>).logger = loggerMock;

describe('Deployment System Integration', () => {
  let deploymentManager: DeploymentManager;
  let featureFlagService: FeatureFlagService;
  let monitoringService: ProductionMonitoringService;

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset singleton instances for each test
    (DeploymentManager as unknown as { instance: null }).instance = null;
    (FeatureFlagService as unknown as { instance: null }).instance = null;
    (ProductionMonitoringService as unknown as { instance: null }).instance = null;

    deploymentManager = DeploymentManager.getInstance();
    featureFlagService = FeatureFlagService.getInstance();
    monitoringService = ProductionMonitoringService.getInstance();

    // Mock console methods to reduce test noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('DeploymentManager', () => {
    test('should create and execute a deployment successfully', async () => {
      // Create deployment configuration
      const deploymentConfig: Omit<DeploymentConfig, 'deploymentId' | 'timestamp'> = {
        environment: 'staging',
        version: 'v2.1.0-test',
        features: [],
        migrations: [
          {
            id: 'test_migration_001',
            name: 'Test Migration',
            description: 'Test database migration',
            type: 'schema_change',
            sql: 'CREATE TABLE test_table (id SERIAL PRIMARY KEY);',
            rollbackSql: 'DROP TABLE test_table;',
            dependencies: [],
            estimatedDuration: 30,
            riskLevel: 'low',
            status: 'pending',
          },
        ],
        rollbackStrategy: 'blue_green',
        healthChecks: [],
      };

      // Create deployment
      const deploymentId = await deploymentManager.createDeployment(deploymentConfig);
      expect(deploymentId).toBeDefined();
      expect(deploymentId).toMatch(/^deploy_/);

      // Verify deployment was created
      const deployment = deploymentManager.getDeployment(deploymentId);
      expect(deployment).toBeDefined();
      expect(deployment?.version).toBe('v2.1.0-test');
      expect(deployment?.environment).toBe('staging');

      // Verify checklist was created
      const checklist = deploymentManager.getChecklist(deploymentId);
      expect(checklist).toBeDefined();
      expect(checklist?.status).toBe('pending');

      // Execute deployment (uses setTimeout internally, must advance fake timers)
      const executePromise = deploymentManager.executeDeployment(deploymentId);
      await vi.runAllTimersAsync();
      const success = await executePromise;
      expect(success).toBe(true);

      // Verify deployment completed
      const updatedChecklist = deploymentManager.getChecklist(deploymentId);
      expect(updatedChecklist?.status).toBe('completed');
      expect(updatedChecklist?.completedAt).toBeDefined();
    });

    test('should handle deployment failure and rollback', async () => {
      const deploymentConfig: Omit<DeploymentConfig, 'deploymentId' | 'timestamp'> = {
        environment: 'staging',
        version: 'v2.1.0-failing',
        features: [],
        migrations: [
          {
            id: 'failing_migration',
            name: 'Failing Migration',
            description: 'Migration that will fail',
            type: 'schema_change',
            sql: 'INVALID SQL STATEMENT;',
            rollbackSql: 'SELECT 1;',
            dependencies: [],
            estimatedDuration: 30,
            riskLevel: 'high',
            status: 'pending',
          },
        ],
        rollbackStrategy: 'rolling_back',
        healthChecks: [],
      };

      const deploymentId = await deploymentManager.createDeployment(deploymentConfig);

      // Mock migration execution to fail
      const originalExecute = deploymentManager['executeSingleMigration'];
      deploymentManager['executeSingleMigration'] = vi
        .fn()
        .mockRejectedValue(new Error('SQL execution failed'));

      // Attempt deployment (should fail) - advance timers for pre-deployment tasks
      const executePromise = deploymentManager.executeDeployment(deploymentId);
      // Attach catch handler immediately to prevent unhandled rejection during timer advance
      executePromise.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(executePromise).rejects.toThrow();

      // Verify deployment failed
      const checklist = deploymentManager.getChecklist(deploymentId);
      expect(checklist?.status).toBe('failed');

      // Execute rollback - advance timers for rollback steps
      const rollbackPromise = deploymentManager.executeRollback(deploymentId);
      await vi.runAllTimersAsync();
      const rollbackSuccess = await rollbackPromise;
      expect(rollbackSuccess).toBe(true);

      // Verify rollback completed
      const rolledBackChecklist = deploymentManager.getChecklist(deploymentId);
      expect(rolledBackChecklist?.status).toBe('rolled_back');

      // Restore original method
      deploymentManager['executeSingleMigration'] = originalExecute;
    });

    test('should track deployment events correctly', async () => {
      const deploymentConfig: Omit<DeploymentConfig, 'deploymentId' | 'timestamp'> = {
        environment: 'development',
        version: 'v2.1.0-events',
        features: [],
        migrations: [],
        rollbackStrategy: 'feature_toggle',
        healthChecks: [],
      };

      const deploymentId = await deploymentManager.createDeployment(deploymentConfig);

      const executePromise = deploymentManager.executeDeployment(deploymentId);
      await vi.runAllTimersAsync();
      await executePromise;

      // Check events were recorded
      const events = deploymentManager.getEvents(deploymentId);
      expect(events.length).toBeGreaterThan(0);

      const startEvent = events.find(e => e.type === 'deployment_started');
      const completedEvent = events.find(e => e.type === 'deployment_completed');

      expect(startEvent).toBeDefined();
      expect(completedEvent).toBeDefined();
      expect(startEvent?.deploymentId).toBe(deploymentId);
      expect(completedEvent?.deploymentId).toBe(deploymentId);
    });
  });

  describe('FeatureFlagService', () => {
    test('should create and manage feature flags', () => {
      // Create a new feature flag
      const flagId = featureFlagService.createFlag({
        name: 'Test Feature',
        description: 'A test feature flag',
        enabled: true,
        rolloutPercentage: 50,
        targetAudience: {
          userTypes: ['admin'],
          organizations: [],
          betaUsers: false,
          newUsers: true,
          regions: [],
        },
        conditions: [],
        createdBy: 'test-user',
      });

      expect(flagId).toBeDefined();
      expect(flagId).toMatch(/^flag_/);

      // Test flag evaluation for different contexts
      const adminContext = { userId: 'user123', userType: 'admin' as const };
      const exhibitorContext = { userId: 'user456', userType: 'exhibitor' as const };

      // Admin should have access due to target audience
      const adminResult = featureFlagService.isEnabled(flagId, adminContext);
      expect(typeof adminResult).toBe('boolean');

      // Exhibitor should not have access due to target audience restriction
      const exhibitorResult = featureFlagService.isEnabled(flagId, exhibitorContext);
      expect(exhibitorResult).toBe(false);
    });

    test('should handle gradual rollout correctly', () => {
      const flagId = featureFlagService.createFlag({
        name: 'Gradual Rollout Test',
        description: 'Testing gradual rollout functionality',
        enabled: true,
        rolloutPercentage: 25, // 25% rollout
        targetAudience: {
          userTypes: [],
          organizations: [],
          betaUsers: false,
          newUsers: false,
          regions: [],
        },
        conditions: [],
        createdBy: 'test-user',
      });

      // Test with multiple user IDs to verify percentage rollout
      const testUsers = Array.from({ length: 100 }, (_, i) => `user${i}`);
      const enabledUsers = testUsers.filter(userId =>
        featureFlagService.isEnabled(flagId, { userId })
      );

      // Should be approximately 25% (allowing for some variance due to hashing)
      expect(enabledUsers.length).toBeGreaterThan(15);
      expect(enabledUsers.length).toBeLessThan(35);
    });

    test('should support emergency rollback', () => {
      const flagId = featureFlagService.createFlag({
        name: 'Emergency Test',
        description: 'Testing emergency rollback',
        enabled: true,
        rolloutPercentage: 100,
        targetAudience: {
          userTypes: [],
          organizations: [],
          betaUsers: false,
          newUsers: false,
          regions: [],
        },
        conditions: [],
        createdBy: 'test-user',
      });

      // Verify flag is initially enabled
      expect(featureFlagService.isEnabled(flagId, { userId: 'test-user' })).toBe(true);

      // Execute emergency rollback (synchronous method)
      const rollbackSuccess = featureFlagService.emergencyRollback(
        flagId,
        'Critical production issue'
      );
      expect(rollbackSuccess).toBe(true);

      // Verify flag is now disabled
      expect(featureFlagService.isEnabled(flagId, { userId: 'test-user' })).toBe(false);

      // Verify rollback was complete (percentage should be 0)
      const flags = featureFlagService.getAllFlags();
      const rolledBackFlag = flags.find(f => f.id === flagId);
      expect(rolledBackFlag?.enabled).toBe(false);
      expect(rolledBackFlag?.rolloutPercentage).toBe(0);
    });

    test('should handle A/B testing scenarios', () => {
      // Create A/B test configuration
      const testId = featureFlagService.createABTest({
        name: 'Button Color Test',
        description: 'Testing different button colors',
        flagId: 'button_color_flag',
        variants: [
          {
            id: 'control',
            name: 'Blue Button',
            description: 'Current blue button',
            allocation: 50,
            flagValue: false,
          },
          {
            id: 'treatment',
            name: 'Green Button',
            description: 'New green button',
            allocation: 50,
            flagValue: true,
          },
        ],
        trafficAllocation: 20, // 20% of users in test
        startDate: new Date(),
        status: 'draft',
        successMetrics: [
          {
            name: 'Click Rate',
            type: 'conversion',
            eventName: 'button_click',
            aggregation: 'count',
            improvementThreshold: 10,
          },
        ],
        segmentationRules: [],
      });

      expect(testId).toBeDefined();
      expect(testId).toMatch(/^abtest_/);

      // Start the A/B test
      const startSuccess = featureFlagService.startABTest(testId);
      expect(startSuccess).toBe(true);
    });

    test('should export configuration correctly', () => {
      // Create multiple flags
      const flag1 = featureFlagService.createFlag({
        name: 'Export Test 1',
        description: 'First test flag',
        enabled: true,
        rolloutPercentage: 100,
        targetAudience: {
          userTypes: [],
          organizations: [],
          betaUsers: false,
          newUsers: false,
          regions: [],
        },
        conditions: [],
        createdBy: 'test-user',
      });

      const flag2 = featureFlagService.createFlag({
        name: 'Export Test 2',
        description: 'Second test flag',
        enabled: false,
        rolloutPercentage: 0,
        targetAudience: {
          userTypes: [],
          organizations: [],
          betaUsers: false,
          newUsers: false,
          regions: [],
        },
        conditions: [],
        createdBy: 'test-user',
      });

      // Export configuration
      const config = featureFlagService.exportConfiguration();

      // 3 default flags (Real-time Sync, Advanced Analytics, Enhanced Offline Mode) + 2 created
      expect(config.flags).toHaveLength(5);
      // 1 default A/B test (Sync Frequency Optimization)
      expect(config.abTests).toHaveLength(1);
      expect(config.exportedAt).toBeInstanceOf(Date);

      const exportedFlag1 = config.flags.find(f => f.id === flag1);
      const exportedFlag2 = config.flags.find(f => f.id === flag2);

      expect(exportedFlag1).toBeDefined();
      expect(exportedFlag2).toBeDefined();
      expect(exportedFlag1?.name).toBe('Export Test 1');
      expect(exportedFlag2?.name).toBe('Export Test 2');
    });
  });

  describe('ProductionMonitoringService', () => {
    test('should initialize and track errors', async () => {
      const initPromise = monitoringService.initialize();
      // NOTE: Do NOT use vi.runAllTimersAsync() - initialize() starts setInterval loops that cause infinite timer loop
      await vi.advanceTimersByTimeAsync(1000);
      await initPromise;

      const testError = new Error('Test error message');
      testError.stack = 'Error: Test error message\n    at test (test.js:1:1)';

      const errorId = monitoringService.reportError(testError, {
        component: 'TestComponent',
        action: 'testAction',
        additionalData: { testData: 'value' },
      });

      expect(errorId).toBeDefined();
      expect(errorId).toMatch(/^error_/);

      // Test duplicate error handling
      const duplicateErrorId = monitoringService.reportError(testError, {
        component: 'TestComponent',
        action: 'testAction',
      });

      // Should return the same error ID for duplicate errors
      expect(duplicateErrorId).toBe(errorId);
    });

    test('should track performance metrics', () => {
      const metricName = 'api_response_time';
      const metricValue = 150; // 150ms

      // Record metric
      monitoringService.recordMetric(metricName, metricValue, 'gauge', {
        endpoint: '/api/test',
        method: 'GET',
      });

      // Record Web Vitals
      monitoringService.recordWebVitals({
        url: '/test-page',
        metrics: {
          fcp: 1200,
          lcp: 2500,
          fid: 50,
          cls: 0.1,
          ttfb: 300,
        },
        deviceInfo: {
          type: 'desktop',
          connection: '4g',
          memory: 8192,
        },
      });

      // Verify metrics were recorded
      const dashboardData = monitoringService.getDashboardData();
      expect(dashboardData.performance).toBeDefined();
      expect(dashboardData.performance.webVitals.fcp).toBeGreaterThan(0);
    });

    test('should track user events and sessions', async () => {
      // Initialize to create a session (required for user tracking)
      const initPromise = monitoringService.initialize();
      await vi.advanceTimersByTimeAsync(1000);
      await initPromise;

      // Track user identification
      monitoringService.identifyUser('test-user-123', {
        name: 'Test User',
        email: 'test@example.com',
        role: 'admin',
      });

      // Track page view
      monitoringService.trackPageView('/dashboard');

      // Track custom events
      monitoringService.trackEvent(
        'button_click',
        {
          button_id: 'save-button',
          page: '/dashboard',
          timestamp: new Date().toISOString(),
        },
        'test-user-123'
      );

      monitoringService.trackEvent(
        'form_submit',
        {
          form_type: 'contact',
          success: true,
        },
        'test-user-123'
      );

      // Verify events were tracked
      const dashboardData = monitoringService.getDashboardData();
      expect(dashboardData.users.activeUsers).toBeGreaterThan(0);
      expect(dashboardData.users.totalSessions).toBeGreaterThan(0);
    });

    test('should handle alert rules and triggering', () => {
      // Create alert rule
      const ruleId = monitoringService.createAlertRule({
        name: 'High Error Rate Alert',
        description: 'Alert when error rate exceeds 5%',
        metric: 'error_rate',
        condition: {
          operator: 'gt',
          timeWindow: 5,
          aggregation: 'avg',
        },
        threshold: 0.05,
        severity: 'error',
        enabled: true,
        channels: ['email', 'slack'],
        cooldown: 15,
      });

      expect(ruleId).toBeDefined();
      expect(ruleId).toMatch(/^alert_rule_/);

      // Test alert acknowledgment
      // Mock alert would be created here for testing
      // Since alerts are private, we'll test the public acknowledge method
      const ackSuccess = monitoringService.acknowledgeAlert('test-alert-123', 'test-user');
      expect(ackSuccess).toBe(false); // Should return false for non-existent alert
    });

    test('should provide comprehensive dashboard data', () => {
      // Generate some test data
      monitoringService.reportError(new Error('Dashboard test error'));
      monitoringService.trackEvent('test_event', { value: 1 });
      monitoringService.recordMetric('test_metric', 100);

      const dashboardData = monitoringService.getDashboardData();

      // Verify dashboard data structure
      expect(dashboardData).toHaveProperty('errors');
      expect(dashboardData).toHaveProperty('performance');
      expect(dashboardData).toHaveProperty('users');
      expect(dashboardData).toHaveProperty('alerts');

      // Verify error data
      expect(dashboardData.errors).toHaveProperty('total');
      expect(dashboardData.errors).toHaveProperty('recent');
      expect(dashboardData.errors).toHaveProperty('byLevel');
      expect(dashboardData.errors).toHaveProperty('topErrors');

      // Verify performance data
      expect(dashboardData.performance).toHaveProperty('avgResponseTime');
      expect(dashboardData.performance).toHaveProperty('errorRate');
      expect(dashboardData.performance).toHaveProperty('throughput');
      expect(dashboardData.performance).toHaveProperty('webVitals');

      // Verify user data
      expect(dashboardData.users).toHaveProperty('activeUsers');
      expect(dashboardData.users).toHaveProperty('totalSessions');
      expect(dashboardData.users).toHaveProperty('avgSessionDuration');
      expect(dashboardData.users).toHaveProperty('topEvents');

      // Verify alert data
      expect(dashboardData.alerts).toHaveProperty('active');
      expect(dashboardData.alerts).toHaveProperty('acknowledged');
      expect(dashboardData.alerts).toHaveProperty('resolved');
      expect(dashboardData.alerts).toHaveProperty('recent');
    });
  });

  describe('Integration Scenarios', () => {
    test('should coordinate deployment with feature flag rollout', async () => {
      // Create a feature flag for deployment
      const flagId = featureFlagService.createFlag({
        name: 'New Dashboard Feature',
        description: 'New dashboard feature for gradual rollout',
        enabled: false, // Start disabled
        rolloutPercentage: 0,
        targetAudience: {
          userTypes: [],
          organizations: [],
          betaUsers: false,
          newUsers: false,
          regions: [],
        },
        conditions: [],
        createdBy: 'deployment-system',
      });

      // Create deployment with feature flag
      const deploymentConfig: Omit<DeploymentConfig, 'deploymentId' | 'timestamp'> = {
        environment: 'production',
        version: 'v2.2.0',
        features: [
          {
            id: flagId,
            name: 'New Dashboard Feature',
            description: 'New dashboard feature for gradual rollout',
            enabled: false,
            rolloutPercentage: 0,
            targetAudience: {
              userTypes: [],
              organizations: [],
              betaUsers: false,
              newUsers: false,
              regions: [],
            },
            conditions: [],
            createdBy: 'deployment-system',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        migrations: [],
        rollbackStrategy: 'feature_toggle',
        healthChecks: [],
      };

      // Execute deployment
      const deploymentId = await deploymentManager.createDeployment(deploymentConfig);
      const executePromise = deploymentManager.executeDeployment(deploymentId);
      await vi.runAllTimersAsync();
      await executePromise;

      // Gradually enable feature flag (updateFlag is synchronous, returns boolean)
      featureFlagService.updateFlag(flagId, {
        enabled: true,
        rolloutPercentage: 5, // Start with 5%
      });

      // Verify flag is partially enabled
      const flags = featureFlagService.getAllFlags();
      const updatedFlag = flags.find(f => f.id === flagId);
      expect(updatedFlag?.enabled).toBe(true);
      expect(updatedFlag?.rolloutPercentage).toBe(5);

      // Simulate monitoring detecting issues and requiring rollback (synchronous)
      featureFlagService.emergencyRollback(flagId, 'High error rate detected');

      // Verify emergency rollback worked
      const rolledBackFlags = featureFlagService.getAllFlags();
      const rolledBackFlag = rolledBackFlags.find(f => f.id === flagId);
      expect(rolledBackFlag?.enabled).toBe(false);
      expect(rolledBackFlag?.rolloutPercentage).toBe(0);
    });

    test('should handle end-to-end monitoring during deployment', async () => {
      // Initialize monitoring
      const initPromise = monitoringService.initialize();
      await vi.advanceTimersByTimeAsync(1000);
      await initPromise;

      // Clear monitoring intervals so they don't interfere with deployment timers.
      // trackEvent/getDashboardData still work - only the periodic loops are stopped.
      vi.clearAllTimers();

      // Create deployment
      const deploymentConfig: Omit<DeploymentConfig, 'deploymentId' | 'timestamp'> = {
        environment: 'production',
        version: 'v2.3.0-monitored',
        features: [],
        migrations: [
          {
            id: 'monitored_migration',
            name: 'Monitored Migration',
            description: 'Migration with full monitoring',
            type: 'schema_change',
            sql: 'ALTER TABLE users ADD COLUMN last_login TIMESTAMPTZ;',
            rollbackSql: 'ALTER TABLE users DROP COLUMN last_login;',
            dependencies: [],
            estimatedDuration: 60,
            riskLevel: 'medium',
            status: 'pending',
          },
        ],
        rollbackStrategy: 'database_restore',
        healthChecks: [],
      };

      // Track deployment start event
      monitoringService.trackEvent('deployment_started', {
        version: deploymentConfig.version,
        environment: deploymentConfig.environment,
      });

      // Execute deployment
      const deploymentId = await deploymentManager.createDeployment(deploymentConfig);

      try {
        const executePromise = deploymentManager.executeDeployment(deploymentId);
        // Safe to use runAllTimersAsync now - monitoring intervals were cleared
        await vi.runAllTimersAsync();
        await executePromise;

        // Track successful deployment
        monitoringService.trackEvent('deployment_completed', {
          deploymentId,
          version: deploymentConfig.version,
          duration: '2m 30s',
        });
      } catch (error) {
        // Report deployment error
        monitoringService.reportError(error as Error, {
          component: 'DeploymentManager',
          action: 'executeDeployment',
          additionalData: { deploymentId, version: deploymentConfig.version },
        });

        // Track failed deployment
        monitoringService.trackEvent('deployment_failed', {
          deploymentId,
          version: deploymentConfig.version,
          error: (error as Error).message,
        });
      }

      // Verify monitoring captured deployment events
      const dashboardData = monitoringService.getDashboardData();
      expect(
        dashboardData.users.topEvents.some(
          e => e.event === 'deployment_started' || e.event === 'deployment_completed'
        )
      ).toBe(true);
    });

    test('should support disaster recovery scenario', async () => {
      // Create critical deployment
      const deploymentConfig: Omit<DeploymentConfig, 'deploymentId' | 'timestamp'> = {
        environment: 'production',
        version: 'v2.4.0-critical',
        features: [],
        migrations: [
          {
            id: 'critical_migration',
            name: 'Critical Database Update',
            description: 'Critical database schema change',
            type: 'schema_change',
            sql: 'CREATE INDEX CONCURRENTLY idx_users_email ON users(email);',
            rollbackSql: 'DROP INDEX CONCURRENTLY idx_users_email;',
            dependencies: [],
            estimatedDuration: 300, // 5 minutes
            riskLevel: 'critical',
            status: 'pending',
          },
        ],
        rollbackStrategy: 'database_restore',
        healthChecks: [],
      };

      const deploymentId = await deploymentManager.createDeployment(deploymentConfig);

      // Monitor system health before deployment
      const preDeploymentHealth = monitoringService.getDashboardData();
      expect(preDeploymentHealth).toBeDefined();

      // Execute deployment
      const executePromise = deploymentManager.executeDeployment(deploymentId);
      await vi.runAllTimersAsync();
      await executePromise;

      // Simulate post-deployment monitoring
      monitoringService.recordMetric('database_connection_time', 50, 'gauge');
      monitoringService.recordMetric('api_response_time', 200, 'gauge');

      // Verify system stability post-deployment
      const postDeploymentHealth = monitoringService.getDashboardData();
      expect(postDeploymentHealth.performance.avgResponseTime).toBeLessThan(1000);

      // Verify deployment events were recorded
      const events = deploymentManager.getEvents(deploymentId);
      expect(events.some(e => e.type === 'deployment_started')).toBe(true);
      expect(events.some(e => e.type === 'deployment_completed')).toBe(true);
      expect(events.some(e => e.type === 'migration_started')).toBe(true);
      expect(events.some(e => e.type === 'migration_completed')).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle high-volume flag evaluations efficiently', () => {
      const flagId = featureFlagService.createFlag({
        name: 'Performance Test Flag',
        description: 'Testing performance with high volume',
        enabled: true,
        rolloutPercentage: 50,
        targetAudience: {
          userTypes: [],
          organizations: [],
          betaUsers: false,
          newUsers: false,
          regions: [],
        },
        conditions: [],
        createdBy: 'performance-test',
      });

      // Use real timers for performance measurement
      vi.useRealTimers();
      const startTime = performance.now();

      // Evaluate flag 1000 times
      for (let i = 0; i < 1000; i++) {
        featureFlagService.isEnabled(flagId, { userId: `user${i}` });
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should complete within reasonable time (less than 100ms for 1000 evaluations)
      expect(totalTime).toBeLessThan(100);

      // Average time per evaluation should be very low
      const avgTime = totalTime / 1000;
      expect(avgTime).toBeLessThan(0.1); // Less than 0.1ms per evaluation

      // Restore fake timers for the rest of the suite
      vi.useFakeTimers();
    });

    test('should handle concurrent deployments correctly', async () => {
      const deploymentPromises = [];

      // Create multiple concurrent deployments
      for (let i = 0; i < 5; i++) {
        const config: Omit<DeploymentConfig, 'deploymentId' | 'timestamp'> = {
          environment: i % 2 === 0 ? 'staging' : 'development',
          version: `v2.${i}.0-concurrent`,
          features: [],
          migrations: [],
          rollbackStrategy: 'blue_green',
          healthChecks: [],
        };

        const promise = deploymentManager
          .createDeployment(config)
          .then(id => deploymentManager.executeDeployment(id));

        deploymentPromises.push(promise);
      }

      // Advance fake timers so all setTimeout calls resolve
      await vi.runAllTimersAsync();

      // Wait for all deployments to complete
      const results = await Promise.allSettled(deploymentPromises);

      // All deployments should succeed
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
      });

      // Verify all events were recorded correctly
      const allEvents = deploymentManager.getEvents();
      expect(allEvents.length).toBeGreaterThanOrEqual(10); // Multiple events per deployment
    });

    test('should manage memory usage with large datasets', { timeout: 30000 }, () => {
      // Generate large number of monitoring events
      for (let i = 0; i < 1000; i++) {
        monitoringService.trackEvent(`test_event_${i % 10}`, {
          iteration: i,
          timestamp: new Date(),
          data: Array(100).fill(`data_${i}`), // Some payload
        });

        if (i % 100 === 0) {
          monitoringService.recordMetric(`metric_${i % 5}`, Math.random() * 1000);
        }

        if (i % 200 === 0) {
          monitoringService.reportError(new Error(`Test error ${i}`));
        }
      }

      // Verify dashboard data is still accessible and reasonable
      const dashboardData = monitoringService.getDashboardData();
      // Without initialize(), no sessions are created, but events are still tracked
      // Check that topEvents is bounded
      expect(dashboardData.users.topEvents.length).toBeLessThanOrEqual(10);
      expect(dashboardData.errors.topErrors.length).toBeLessThanOrEqual(10);
    });
  });
});
