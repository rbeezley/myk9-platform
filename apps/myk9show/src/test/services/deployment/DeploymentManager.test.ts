/**
 * DeploymentManager tests: execution, failure and rollback, event tracking,
 * and concurrent deployments.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeploymentManager } from '@/services/deployment/DeploymentManager';
import { DeploymentConfig } from '@/types/deployment-types';

describe('DeploymentManager', () => {
  let deploymentManager: DeploymentManager;

  beforeEach(() => {
    vi.useFakeTimers();
    (DeploymentManager as unknown as { instance: null }).instance = null;
    deploymentManager = DeploymentManager.getInstance();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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
});
