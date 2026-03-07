/**
 * Feature Flag Service Helpers
 *
 * Pure utility functions for evaluating feature flag conditions,
 * hashing contexts, and checking user attributes.
 */

import type { TargetAudience, FeatureCondition, ConditionType } from '../../types/deployment-types';
import type { FeatureFlagContext } from './FeatureFlagService.types';

/**
 * Check if a context matches the target audience criteria
 */
export function matchesTargetAudience(
  audience: TargetAudience,
  context: FeatureFlagContext
): boolean {
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
  if (audience.betaUsers && !isBetaUser(context)) {
    return false;
  }

  // Check new users (registered within last 30 days)
  if (audience.newUsers && !isNewUser(context)) {
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

/**
 * Evaluate a single feature condition against a context
 */
export function evaluateCondition(
  condition: FeatureCondition,
  context: FeatureFlagContext
): boolean {
  const contextValue = getContextValue(condition.type, context);

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

/**
 * Extract the relevant value from context based on condition type
 */
export function getContextValue(type: ConditionType, context: FeatureFlagContext): unknown {
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

/**
 * Generate a deterministic hash from a flag ID and context for consistent rollout bucketing
 */
export function hashContext(flagId: string, context: FeatureFlagContext): number {
  const str = `${flagId}:${context.userId || 'anonymous'}:${context.organizationId || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Generate a cache key for a flag evaluation
 */
export function getCacheKey(flagId: string, context: FeatureFlagContext): string {
  return `${flagId}:${JSON.stringify(context)}`;
}

/**
 * Check if a user has beta status based on custom attributes
 */
export function isBetaUser(context: FeatureFlagContext): boolean {
  return context.customAttributes?.['beta_user'] === true;
}

/**
 * Check if a user registered within the last 30 days
 */
export function isNewUser(context: FeatureFlagContext): boolean {
  if (!context.registrationDate) return false;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return context.registrationDate > thirtyDaysAgo;
}
