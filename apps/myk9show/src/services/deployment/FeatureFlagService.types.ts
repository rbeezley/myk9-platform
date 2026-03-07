/**
 * Feature Flag Service Types
 *
 * Type definitions for the FeatureFlagService, including context,
 * metrics, A/B testing, and statistical analysis interfaces.
 */

import type { ConditionType, ConditionOperator, UserType } from '../../types/deployment-types';

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

export interface ABTestResults {
  testId: string;
  totalUsers: number;
  variantResults: VariantResult[];
}

export interface VariantResult {
  variantId: string;
  users: number;
  conversions: number;
  conversionRate: number;
}

export interface StatisticalSignificance {
  isSignificant: boolean;
  confidenceLevel: number;
  pValue: number;
  effect: number;
}
