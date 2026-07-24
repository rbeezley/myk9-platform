// Pure resolver: sanitized server entitlement context -> EffectiveEntitlement.
//
// Precedence (design.md Decision 6): active paid Premium > active founding /
// complimentary grant > free. 'scheduled' grants are NOT premium. Ended
// sources (paid past its expiry, or a grant that is expired/revoked/
// superseded) produce status 'expired' with the most relevant end date when
// no other source is active.

import type { OwnEntitlementContext } from '@/services/database/entitlement/types';
import type { AnalyticsTrialState, EffectiveEntitlement } from './types';
import { TRIAL_SHOW_LIMIT } from './types';

type ActiveGrantSource = 'founding' | 'complimentary';

export interface ResolveEntitlementOptions {
  /** Cache's short maximum-stale interval, in ms. */
  maxStaleMs: number;
}

/** Grant statuses that mean the grant is over (as opposed to active or not-yet-started). */
const ENDED_GRANT_STATUSES = new Set(['expired', 'revoked', 'superseded']);

function resolveAnalyticsTrial(
  scoredShowCount: number,
  tier: 'free' | 'premium'
): AnalyticsTrialState {
  if (tier === 'premium') {
    return { status: 'unavailable', scoredShowCount, showLimit: TRIAL_SHOW_LIMIT };
  }
  return {
    status: scoredShowCount <= TRIAL_SHOW_LIMIT ? 'active' : 'used',
    scoredShowCount,
    showLimit: TRIAL_SHOW_LIMIT,
  };
}

function grantSourceFor(grantType: OwnEntitlementContext['grant_type']): ActiveGrantSource {
  return grantType === 'founding' ? 'founding' : 'complimentary';
}

export function resolveEntitlement(
  context: OwnEntitlementContext,
  opts: ResolveEntitlementOptions
): EffectiveEntitlement {
  const evaluatedAt = context.evaluated_at;
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const staleBoundaryMs = evaluatedAtMs + opts.maxStaleMs;
  const trustedUntilBoundedBy = (sourceEndMs: number) =>
    new Date(Math.min(sourceEndMs, staleBoundaryMs)).toISOString();

  // Mirror the server's has_effective_premium_access exactly: only 'premium'
  // (and legacy 'pro') tiers count as paid. A 'free' tier row with a stale
  // subscription_expires_at value must never resolve as active or expired paid.
  const isPaidTier = context.paid_tier === 'premium' || context.paid_tier === 'pro';
  const paidExpiresAtMs = context.paid_expires_at ? Date.parse(context.paid_expires_at) : null;
  const paidActive = isPaidTier && paidExpiresAtMs != null && paidExpiresAtMs > evaluatedAtMs;
  const paidEnded = isPaidTier && paidExpiresAtMs != null && paidExpiresAtMs <= evaluatedAtMs;

  const grantActive = context.grant_status === 'active' && context.grant_type != null;
  const grantEnded =
    context.grant_type != null &&
    context.grant_status != null &&
    ENDED_GRANT_STATUSES.has(context.grant_status);

  if (paidActive) {
    const endsAtMs = paidExpiresAtMs as number;
    return {
      tier: 'premium',
      status: 'active',
      source: 'paid',
      endsAt: context.paid_expires_at as string,
      evaluatedAt,
      trustedUntil: trustedUntilBoundedBy(endsAtMs),
      canManageBilling: true,
      analyticsTrial: resolveAnalyticsTrial(context.scored_show_count, 'premium'),
    };
  }

  if (grantActive) {
    const endsAtMs = Date.parse(context.grant_ends_at as string);
    return {
      tier: 'premium',
      status: 'active',
      source: grantSourceFor(context.grant_type),
      endsAt: context.grant_ends_at as string,
      evaluatedAt,
      trustedUntil: trustedUntilBoundedBy(endsAtMs),
      canManageBilling: false,
      analyticsTrial: resolveAnalyticsTrial(context.scored_show_count, 'premium'),
    };
  }

  // No account source is currently active (a 'scheduled' grant does not count).
  if (paidEnded || grantEnded) {
    const grantEndsAtMs = grantEnded ? Date.parse(context.grant_ends_at as string) : null;
    const candidates: Array<{ ms: number; iso: string }> = [];
    if (paidEnded)
      candidates.push({ ms: paidExpiresAtMs as number, iso: context.paid_expires_at as string });
    if (grantEnded)
      candidates.push({ ms: grantEndsAtMs as number, iso: context.grant_ends_at as string });
    const mostRecent = candidates.reduce((a, b) => (b.ms > a.ms ? b : a));
    // A revoked/superseded grant ended the moment it was cut short, not at its
    // scheduled ends_at (which may still be in the future — the sanitized
    // context deliberately omits revoked_at). We cannot know the real instant,
    // and clamping to evaluatedAt would MOVE the reported end date on every
    // refresh. Report no date at all instead; consumers render a dateless
    // "access has ended" phrase.
    const endsAtIso = mostRecent.ms > evaluatedAtMs ? null : mostRecent.iso;

    return {
      tier: 'free',
      status: 'expired',
      source: 'none',
      endsAt: endsAtIso,
      evaluatedAt,
      trustedUntil: new Date(staleBoundaryMs).toISOString(),
      canManageBilling: false,
      analyticsTrial: resolveAnalyticsTrial(context.scored_show_count, 'free'),
    };
  }

  return {
    tier: 'free',
    status: 'free',
    source: 'none',
    endsAt: null,
    evaluatedAt,
    trustedUntil: new Date(staleBoundaryMs).toISOString(),
    canManageBilling: false,
    analyticsTrial: resolveAnalyticsTrial(context.scored_show_count, 'free'),
  };
}
