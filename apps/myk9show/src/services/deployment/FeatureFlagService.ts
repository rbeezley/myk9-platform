/**
 * Feature Flag Service
 * 
 * Advanced feature flag management with gradual rollout, A/B testing,
 * and user targeting capabilities for production deployments.
 */

import {
  FeatureFlagConfig,
  TargetAudience,
  FeatureCondition,
  UserType,
  ConditionType,
  ConditionOperator
} from '../../types/deployment-types';

export interface FeatureFlagContext {
  userId?: string;
  userType?: UserType;
  organizationId?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet';
  platform?: 'ios' | 'android' | 'web';
  appVersion?: string;
  registrationDate?: Date;
  location?: {
    country?: string;
    region?: string;
    timezone?: string;
  };
  experiments?: string[];
  customAttributes?: Record<string, unknown>;
}

export interface FeatureFlagMetrics {
  flagId: string;
  flagName: string;
  enabled: boolean;
  totalEvaluations: number;
  trueEvaluations: number;
  falseEvaluations: number;
  evaluationRate: number;
  userSegments: {
    segment: string;
    evaluations: number;
    enabledCount: number;
  }[];
  performanceImpact: {
    avgEvaluationTime: number;
    errorRate: number;
  };
  rolloutProgress: {
    targetPercentage: number;
    actualPercentage: number;
    usersCovered: number;
  };
}

export interface ABTestConfig {
  id: string;
  name: string;
  description: string;
  flagId: string;
  variants: ABTestVariant[];
  trafficAllocation: number; // percentage of users in test
  startDate: Date;
  endDate?: Date;
  status: 'draft' | 'running' | 'paused' | 'completed';
  successMetrics: SuccessMetric[];
  segmentationRules: SegmentationRule[];
}

export interface ABTestVariant {
  id: string;
  name: string;
  description: string;
  allocation: number; // percentage within test
  flagValue: boolean;
  customProperties?: Record<string, unknown>;
}

export interface SuccessMetric {
  name: string;
  type: 'conversion' | 'engagement' | 'retention' | 'revenue';
  eventName: string;
  aggregation: 'count' | 'sum' | 'average';
  target?: number;
  improvementThreshold: number; // minimum improvement %
}

export interface SegmentationRule {
  field: ConditionType;
  operator: ConditionOperator;
  value: unknown;
  description: string;
}

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
      const cacheKey = this.getCacheKey(flagId, context);
      const cached = this.evaluationCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        this.recordEvaluation(flagId, cached.result, performance.now() - startTime);
        return cached.result;
      }

      const flag = this.flags.get(flagId);
      if (!flag) {
        console.warn(`Feature flag ${flagId} not found, defaulting to false`);
        this.recordEvaluation(flagId, false, performance.now() - startTime);
        return false;
      }

      const result = this.evaluateFlag(flag, context);
      
      // Cache the result
      this.evaluationCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      this.recordEvaluation(flagId, result, performance.now() - startTime);
      return result;

    } catch (error) {
      console.error(`Error evaluating feature flag ${flagId}:`, error);
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
      updatedAt: new Date()
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
      updatedAt: new Date()
    };

    this.flags.set(flagId, updatedFlag);
    this.clearCache();

    return true;
  }

  /**
   * Gradually rollout a feature to a percentage of users
   */
  public gradualRollout(flagId: string, targetPercentage: number, durationHours: number = 24): boolean {
    const flag = this.flags.get(flagId);
    if (!flag) {
      return false;
    }

    const incrementsPerHour = Math.max(1, Math.floor(durationHours / 4)); // Update 4 times during rollout
    const incrementSize = targetPercentage / (durationHours * incrementsPerHour);

    // Start rollout process (in a real implementation, this would be scheduled)
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
      id: testId
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
      statisticalSignificance: significance
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
    
    console.warn(`Emergency rollback executed for flag ${flagId}: ${reason}`);
    
    // In a real implementation, this would trigger alerts
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
    console.warn('Kill switch activated - all non-critical features disabled');
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
      exportedAt: new Date()
    };
  }

  // === Private Implementation Methods ===

  private evaluateFlag(flag: FeatureFlagConfig, context: FeatureFlagContext): boolean {
    // Check if flag is enabled
    if (!flag.enabled) {
      return false;
    }

    // Check date range
    if (flag.startDate && new Date() < flag.startDate) {
      return false;
    }
    if (flag.endDate && new Date() > flag.endDate) {
      return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashContext(flag.id, context);
      if (hash % 100 >= flag.rolloutPercentage) {
        return false;
      }
    }

    // Check target audience
    if (!this.matchesTargetAudience(flag.targetAudience, context)) {
      return false;
    }

    // Check feature conditions
    for (const condition of flag.conditions) {
      if (!this.evaluateCondition(condition, context)) {
        return false;
      }
    }

    return true;
  }

  private matchesTargetAudience(audience: TargetAudience, context: FeatureFlagContext): boolean {
    // Check user types
    if (audience.userTypes.length > 0 && context.userType) {
      if (!audience.userTypes.includes(context.userType)) {
        return false;
      }
    }

    // Check organizations
    if (audience.organizations.length > 0 && context.organizationId) {
      if (!audience.organizations.includes(context.organizationId)) {
        return false;
      }
    }

    // Check beta users (would need to be determined from user profile)
    if (audience.betaUsers && !this.isBetaUser(context)) {
      return false;
    }

    // Check new users (registered within last 30 days)
    if (audience.newUsers && !this.isNewUser(context)) {
      return false;
    }

    // Check regions
    if (audience.regions.length > 0 && context.location?.region) {
      if (!audience.regions.includes(context.location.region)) {
        return false;
      }
    }

    return true;
  }

  private evaluateCondition(condition: FeatureCondition, context: FeatureFlagContext): boolean {
    const contextValue = this.getContextValue(condition.type, context);
    
    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      case 'not_equals':
        return contextValue !== condition.value;
      case 'contains':
        return String(contextValue).includes(String(condition.value));
      case 'not_contains':
        return !String(contextValue).includes(String(condition.value));
      case 'greater_than':
        return Number(contextValue) > Number(condition.value);
      case 'less_than':
        return Number(contextValue) < Number(condition.value);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(contextValue);
      default:
        return false;
    }
  }

  private getContextValue(type: ConditionType, context: FeatureFlagContext): unknown {
    switch (type) {
      case 'user_id':
        return context.userId;
      case 'organization_id':
        return context.organizationId;
      case 'user_type':
        return context.userType;
      case 'registration_date':
        return context.registrationDate;
      case 'device_type':
        return context.deviceType;
      case 'platform':
        return context.platform;
      case 'app_version':
        return context.appVersion;
      default:
        return undefined;
    }
  }

  private hashContext(flagId: string, context: FeatureFlagContext): number {
    const str = `${flagId}:${context.userId || 'anonymous'}:${context.organizationId || ''}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private getCacheKey(flagId: string, context: FeatureFlagContext): string {
    return `${flagId}:${JSON.stringify(context)}`;
  }

  private clearCache(): void {
    this.evaluationCache.clear();
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
      metrics.performanceImpact.errorRate += 0.01; // Simplified error tracking
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
        errorRate: 0
      },
      rolloutProgress: {
        targetPercentage: 0,
        actualPercentage: 0,
        usersCovered: 0
      }
    });
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeDefaultFlags(): void {
    // Real-time sync feature
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
        regions: []
      },
      conditions: [],
      createdBy: 'system'
    });

    // Advanced analytics
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
        regions: []
      },
      conditions: [],
      createdBy: 'system'
    });

    // Offline mode improvements
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
        regions: []
      },
      conditions: [],
      createdBy: 'system'
    });
  }

  private initializeDefaultABTests(): void {
    // Example A/B test for sync frequency
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
          flagValue: false
        },
        {
          id: 'fast_sync',
          name: 'Fast Sync',
          description: 'Increased sync frequency (10 seconds)',
          allocation: 50,
          flagValue: true
        }
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
          improvementThreshold: 10
        }
      ],
      segmentationRules: [
        {
          field: 'user_type',
          operator: 'in',
          value: ['judge', 'secretary'],
          description: 'Target active show participants'
        }
      ]
    });
  }

  // Helper methods for A/B testing
  private getActiveABTest(flagId: string): ABTestConfig | null {
    for (const test of this.abTests.values()) {
      if (test.flagId === flagId && test.status === 'running') {
        return test;
      }
    }
    return null;
  }

  private isUserInTest(test: ABTestConfig, context: FeatureFlagContext): boolean {
    const hash = this.hashContext(test.id, context);
    return (hash % 100) < test.trafficAllocation;
  }

  private assignVariant(test: ABTestConfig, context: FeatureFlagContext): ABTestVariant | null {
    const hash = this.hashContext(`${test.id}_variant`, context);
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

  // Placeholder implementations for complex features
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private scheduleRolloutIncrements(flagId: string, incrementSize: number, incrementsPerHour: number, durationHours: number): void {
    console.log(`Scheduled gradual rollout for ${flagId}: ${incrementSize}% increments every ${60/incrementsPerHour} minutes`);
  }

  private calculateABTestResults(test: ABTestConfig): ABTestResults {
    // Placeholder for A/B test results calculation
    return {
      testId: test.id,
      totalUsers: 1000,
      variantResults: test.variants.map(variant => ({
        variantId: variant.id,
        users: 500,
        conversions: 50,
        conversionRate: 0.1
      }))
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private calculateStatisticalSignificance(results: ABTestResults): StatisticalSignificance {
    // Placeholder for statistical significance calculation
    return {
      isSignificant: false,
      confidenceLevel: 0.95,
      pValue: 0.15,
      effect: 0.02
    };
  }

  private triggerEmergencyAlert(flagId: string, reason: string): void {
    console.error(`EMERGENCY ALERT: Feature flag ${flagId} rolled back - ${reason}`);
  }

  private isBetaUser(context: FeatureFlagContext): boolean {
    // Placeholder - would check user profile for beta status
    return context.customAttributes?.['beta_user'] === true;
  }

  private isNewUser(context: FeatureFlagContext): boolean {
    if (!context.registrationDate) return false;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return context.registrationDate > thirtyDaysAgo;
  }
}

// Supporting types for A/B testing
interface ABTestResults {
  testId: string;
  totalUsers: number;
  variantResults: VariantResult[];
}

interface VariantResult {
  variantId: string;
  users: number;
  conversions: number;
  conversionRate: number;
}

interface StatisticalSignificance {
  isSignificant: boolean;
  confidenceLevel: number;
  pValue: number;
  effect: number;
}

export default FeatureFlagService;