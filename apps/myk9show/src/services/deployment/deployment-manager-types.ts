/**
 * Deployment Manager Types
 *
 * Local type definitions used by DeploymentManager that are not part
 * of the shared deployment-types module.
 */

/**
 * Context for evaluating whether a feature flag is enabled for a specific user.
 */
export interface FeatureFlagEvalContext {
  userId?: string;
  userType?: string;
  organizationId?: string;
  deviceType?: string;
}
