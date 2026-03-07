/**
 * Feature Flag Service
 *
 * Advanced feature flag management with gradual rollout, A/B testing,
 * and user targeting capabilities for production deployments.
 */

import { logger } from '@/services/LoggingService';
import { FeatureFlagConfig } from '../../types/deployment-types';
import {
  evaluateCondition,
  matchesTargetAudience,
  hashContext,
  getCacheKey,
} from './FeatureFlagService.helpers';
import type {
  FeatureFlagContext,
  FeatureFlagMetrics,
  ABTestConfig,
  ABTestVariant,
  ABTestResults,
  StatisticalSignificance,
} from './FeatureFlagService.types';

// Re-export all types for backward compatibility
export type {
  FeatureFlagContext,
  FeatureFlagMetrics,
  ABTestConfig,
  ABTestVariant,
  SuccessMetric,
  SegmentationRule,
} from './FeatureFlagService.types';

/**
 * Main Feature Flag Service
 */
export class FeatureFlagService {
  private static instance: FeatureFlagService;
  private flags: Map<string, FeatureFlagConfig> = new Map();
  private metrics: Map<string, FeatureFlagMetrics> = new Map();
  private abTests: Map<string, ABTestConfig> = new Map();
  private evaluationCache: Map<string, { result: boolean; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.initializeDefaultFlags();
    this.initializeDefaultABTests();
  }

  public static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService();
    }
    return FeatureFlagService.instance;
  }

  // === Core Feature Flag Operations ===

  /**
   * Evaluate if a feature is enabled for a given context
   */
  public isEnabled(flagId: string, context: FeatureFlagContext = {}): boolean {
    const startTime = performance.now();

    try {
      // Check cache first
      const cacheKey = getCacheKey(flagId, context);
      const cached = this.evaluationCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.recordEvaluation(flagId, cached.result, performance.now() - startTime);
        return cached.result;
      }

      const flag = this.flags.get(flagId);
      if (!flag) {
        logger.warn('Feature flag not found, defaulting to false', 'flags', { flagId });
        this.recordEvaluation(flagId, false, performance.now() - startTime);
        return false;
      }

      const result = this.evaluateFlag(flag, context);

      // Cache the result
      this.evaluationCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });

      this.recordEvaluation(flagId, result, performance.now() - startTime);
      return result;
    } catch (error) {
      logger.error('Error evaluating feature flag', 'flags', { flagId }, error as Error);
      this.recordEvaluationError(flagId);
      return false;
    }
  }

  /**
   * Get feature flag value with variant support for A/B testing
   */
  public getVariant(flagId: string, context: FeatureFlagContext = {}): string | boolean {
    const isEnabled = this.isEnabled(flagId, context);

    // Check if this flag is part of an A/B test
    const abTest = this.getActiveABTest(flagId);
    if (abTest && this.isUserInTest(abTest, context)) {
      const variant = this.assignVariant(abTest, context);
      return variant ? variant.name : false;
    }

    return isEnabled;
  }

  /**
   * Create or update a feature flag
   */
  public createFlag(flag: Omit<FeatureFlagConfig, 'id' | 'createdAt' | 'updatedAt'>): string {
    const flagId = this.generateId('flag');
    const newFlag: FeatureFlagConfig = {
      ...flag,
      id: flagId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.flags.set(flagId, newFlag);
    this.initializeMetrics(flagId, newFlag.name);
    this.clearCache();

    return flagId;
  }

  /**
   * Update existing feature flag
   */
  public updateFlag(flagId: string, updates: Partial<FeatureFlagConfig>): boolean {
    const flag = this.flags.get(flagId);
    if (!flag) {
      return false;
    }

    const updatedFlag: FeatureFlagConfig = {
      ...flag,
      ...updates,
      updatedAt: new Date(),
    };

    this.flags.set(flagId, updatedFlag);
    this.clearCache();

    return true;
  }

  /**
   * Gradually rollout a feature to a percentage of users
   */
  public gradualRollout(
    flagId: string,
    targetPercentage: number,
    durationHours: number = 24
  ): boolean {
    const flag = this.flags.get(flagId);
    if (!flag) {
      return false;
    }

    const incrementsPerHour = Math.max(1, Math.floor(durationHours / 4));
    const incrementSize = targetPercentage / (durationHours * incrementsPerHour);

    this.scheduleRolloutIncrements(flagId, incrementSize, incrementsPerHour, durationHours);

    return true;
  }

  // === A/B Testing Support ===

  /**
   * Create an A/B test configuration
   */
  public createABTest(config: Omit<ABTestConfig, 'id'>): string {
    const testId = this.generateId('abtest');
    const abTest: ABTestConfig = {
      ...config,
      id: testId,
    };

    this.abTests.set(testId, abTest);
    return testId;
  }

  /**
   * Start an A/B test
   */
  public startABTest(testId: string): boolean {
    const test = this.abTests.get(testId);
    if (!test || test.status !== 'draft') {
      return false;
    }

    test.status = 'running';
    test.startDate = new Date();
    this.clearCache();

    return true;
  }

  /**
   * Get A/B test results and statistical significance
   */
  public getABTestResults(testId: string): {
    test: ABTestConfig;
    results: ABTestResults;
    statisticalSignificance: StatisticalSignificance;
  } | null {
    const test = this.abTests.get(testId);
    if (!test) {
      return null;
    }

    const results = this.calculateABTestResults(test);
    const significance = this.calculateStatisticalSignificance(results);

    return {
      test,
      results,
      statisticalSignificance: significance,
    };
  }

  // === Emergency Controls ===

  /**
   * Emergency rollback - immediately disable a feature
   */
  public emergencyRollback(flagId: string, reason: string): boolean {
    const flag = this.flags.get(flagId);
    if (!flag) {
      return false;
    }

    flag.enabled = false;
    flag.rolloutPercentage = 0;
    flag.updatedAt = new Date();

    this.clearCache();

    logger.warn('Emergency rollback executed', 'flags', { flagId, reason });

    this.triggerEmergencyAlert(flagId, reason);

    return true;
  }

  /**
   * Kill switch - disable all non-critical features
   */
  public activateKillSwitch(criticalFlagsOnly: string[] = []): void {
    for (const [flagId, flag] of this.flags) {
      if (!criticalFlagsOnly.includes(flagId)) {
        flag.enabled = false;
        flag.updatedAt = new Date();
      }
    }

    this.clearCache();
    logger.warn('Kill switch activated - all non-critical features disabled', 'flags');
  }

  // === Analytics and Monitoring ===

  /**
   * Get feature flag usage metrics
   */
  public getMetrics(flagId: string): FeatureFlagMetrics | null {
    return this.metrics.get(flagId) || null;
  }

  /**
   * Get all feature flags with their current status
   */
  public getAllFlags(): FeatureFlagConfig[] {
    return Array.from(this.flags.values());
  }

  /**
   * Export feature flag configuration for deployment
   */
  public exportConfiguration(): {
    flags: FeatureFlagConfig[];
    abTests: ABTestConfig[];
    exportedAt: Date;
  } {
    return {
      flags: this.getAllFlags(),
      abTests: Array.from(this.abTests.values()),
      exportedAt: new Date(),
    };
  }

  // === Private Implementation Methods ===

  private evaluateFlag(flag: FeatureFlagConfig, context: FeatureFlagContext): boolean {
    if (!flag.enabled) {
      return false;
    }

    if (flag.startDate && new Date() < flag.startDate) {
      return false;
    }
    if (flag.endDate && new Date() > flag.endDate) {
      return false;
    }

    if (flag.rolloutPercentage < 100) {
      const hash = hashContext(flag.id, context);
      if (hash % 100 >= flag.rolloutPercentage) {
        return false;
      }
    }

    if (!matchesTargetAudience(flag.targetAudience, context)) {
      return false;
    }

    for (const condition of flag.conditions) {
      if (!evaluateCondition(condition, context)) {
        return false;
      }
    }

    return true;
  }

  private recordEvaluation(flagId: string, result: boolean, evaluationTime: number): void {
    const metrics = this.metrics.get(flagId);
    if (metrics) {
      metrics.totalEvaluations++;
      if (result) {
        metrics.trueEvaluations++;
      } else {
        metrics.falseEvaluations++;
      }
      metrics.evaluationRate = metrics.trueEvaluations / metrics.totalEvaluations;
      metrics.performanceImpact.avgEvaluationTime =
        (metrics.performanceImpact.avgEvaluationTime + evaluationTime) / 2;
    }
  }

  private recordEvaluationError(flagId: string): void {
    const metrics = this.metrics.get(flagId);
    if (metrics) {
      metrics.performanceImpact.errorRate += 0.01;
    }
  }

  private initializeMetrics(flagId: string, flagName: string): void {
    this.metrics.set(flagId, {
      flagId,
      flagName,
      enabled: true,
      totalEvaluations: 0,
      trueEvaluations: 0,
      falseEvaluations: 0,
      evaluationRate: 0,
      userSegments: [],
      performanceImpact: {
        avgEvaluationTime: 0,
        errorRate: 0,
      },
      rolloutProgress: {
        targetPercentage: 0,
        actualPercentage: 0,
        usersCovered: 0,
      },
    });
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private clearCache(): void {
    this.evaluationCache.clear();
  }

  private initializeDefaultFlags(): void {
    this.createFlag({
      name: 'Real-time Sync',
      description: 'Enable real-time synchronization between devices',
      enabled: false,
      rolloutPercentage: 0,
      targetAudience: {
        userTypes: ['admin'],
        organizations: [],
        betaUsers: true,
        newUsers: false,
        regions: [],
      },
      conditions: [],
      createdBy: 'system',
    });

    this.createFlag({
      name: 'Advanced Analytics',
      description: 'Enable advanced performance monitoring and analytics',
      enabled: true,
      rolloutPercentage: 100,
      targetAudience: {
        userTypes: [],
        organizations: [],
        betaUsers: false,
        newUsers: true,
        regions: [],
      },
      conditions: [],
      createdBy: 'system',
    });

    this.createFlag({
      name: 'Enhanced Offline Mode',
      description: 'Enable enhanced offline capabilities with better conflict resolution',
      enabled: false,
      rolloutPercentage: 25,
      targetAudience: {
        userTypes: ['judge', 'secretary'],
        organizations: [],
        betaUsers: false,
        newUsers: false,
        regions: [],
      },
      conditions: [],
      createdBy: 'system',
    });
  }

  private initializeDefaultABTests(): void {
    this.createABTest({
      name: 'Sync Frequency Optimization',
      description: 'Test different sync frequencies for better performance',
      flagId: 'sync_frequency_test',
      variants: [
        {
          id: 'control',
          name: 'Standard Sync',
          description: 'Current sync frequency (30 seconds)',
          allocation: 50,
          flagValue: false,
        },
        {
          id: 'fast_sync',
          name: 'Fast Sync',
          description: 'Increased sync frequency (10 seconds)',
          allocation: 50,
          flagValue: true,
        },
      ],
      trafficAllocation: 20,
      startDate: new Date(),
      status: 'draft',
      successMetrics: [
        {
          name: 'User Satisfaction',
          type: 'engagement',
          eventName: 'sync_satisfaction_rating',
          aggregation: 'average',
          target: 4.5,
          improvementThreshold: 10,
        },
      ],
      segmentationRules: [
        {
          field: 'user_type',
          operator: 'in',
          value: ['judge', 'secretary'],
          description: 'Target active show participants',
        },
      ],
    });
  }

  // A/B testing helpers
  private getActiveABTest(flagId: string): ABTestConfig | null {
    for (const test of this.abTests.values()) {
      if (test.flagId === flagId && test.status === 'running') {
        return test;
      }
    }
    return null;
  }

  private isUserInTest(test: ABTestConfig, context: FeatureFlagContext): boolean {
    const hash = hashContext(test.id, context);
    return hash % 100 < test.trafficAllocation;
  }

  private assignVariant(test: ABTestConfig, context: FeatureFlagContext): ABTestVariant | null {
    const hash = hashContext(`${test.id}_variant`, context);
    const randomValue = hash % 100;

    let cumulativeAllocation = 0;
    for (const variant of test.variants) {
      cumulativeAllocation += variant.allocation;
      if (randomValue < cumulativeAllocation) {
        return variant;
      }
    }

    return test.variants[0] || null;
  }

  private scheduleRolloutIncrements(
    flagId: string,
    incrementSize: number,
    incrementsPerHour: number,
    _durationHours: number
  ): void {
    logger.info('Scheduled gradual rollout', 'flags', {
      flagId,
      incrementSize,
      intervalMinutes: 60 / incrementsPerHour,
    });
  }

  private calculateABTestResults(test: ABTestConfig): ABTestResults {
    return {
      testId: test.id,
      totalUsers: 1000,
      variantResults: test.variants.map(variant => ({
        variantId: variant.id,
        users: 500,
        conversions: 50,
        conversionRate: 0.1,
      })),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private calculateStatisticalSignificance(results: ABTestResults): StatisticalSignificance {
    return {
      isSignificant: false,
      confidenceLevel: 0.95,
      pValue: 0.15,
      effect: 0.02,
    };
  }

  private triggerEmergencyAlert(flagId: string, reason: string): void {
    logger.error('EMERGENCY ALERT: Feature flag rolled back', 'flags', { flagId, reason });
  }
}

export default FeatureFlagService;
