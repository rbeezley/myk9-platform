// Effective-entitlement contract.
//
// See openspec/changes/exhibitor-journey-completion/design.md Decision 6:
// "Use one effective-entitlement value everywhere". Modeled as a discriminated
// union on `status` so combinations like tier:'premium' + status:'expired' are
// unrepresentable at the type level.

/** Account-level Premium source. 'none' when no source is currently active. */
export type EntitlementSource = 'paid' | 'founding' | 'complimentary' | 'none';

/**
 * The existing first-three-scored-shows trial, scoped to Premium Analytics
 * only (never a stand-in for full account Premium).
 */
export interface AnalyticsTrialState {
  /** 'unavailable' whenever account Premium is already active (the trial is moot). */
  status: 'active' | 'used' | 'unavailable';
  scoredShowCount: number | null;
  showLimit: number;
}

interface EffectiveEntitlementBase {
  /** Server `now()` at evaluation time (from get_own_entitlement_context()). */
  evaluatedAt: string;
  /** Upper bound until which this result may be trusted without a refresh. */
  trustedUntil: string;
  analyticsTrial: AnalyticsTrialState;
}

export interface EffectiveEntitlementActive extends EffectiveEntitlementBase {
  tier: 'premium';
  status: 'active';
  source: 'paid' | 'founding' | 'complimentary';
  endsAt: string;
  /** True only for source 'paid' — grants never expose billing-management controls. */
  canManageBilling: boolean;
}

export interface EffectiveEntitlementExpired extends EffectiveEntitlementBase {
  tier: 'free';
  status: 'expired';
  source: 'none';
  /**
   * Most relevant end date among the sources that ended, or null when no exact
   * end date is knowable. A grant cut short by revocation/supersession still
   * carries its originally SCHEDULED ends_at, and the sanitized server context
   * deliberately omits revoked_at — so the true end instant is unknown. Null
   * means "access has ended, date not knowable"; consumers must render a
   * truthful dateless phrase rather than inventing one.
   */
  endsAt: string | null;
  canManageBilling: false;
}

export interface EffectiveEntitlementFree extends EffectiveEntitlementBase {
  tier: 'free';
  status: 'free';
  source: 'none';
  endsAt: null;
  canManageBilling: false;
}

export type EffectiveEntitlement =
  EffectiveEntitlementActive | EffectiveEntitlementExpired | EffectiveEntitlementFree;

/** Scored-show count boundary for the Premium Analytics trial. */
export const TRIAL_SHOW_LIMIT = 3;
