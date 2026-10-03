/**
 * Routes where interrupting the user could lose work or break a live flow:
 * checkout and registration, and every show-day surface a judge, steward or
 * secretary uses while a class is running.
 *
 * ONE definition, two consumers:
 *   - the PWA update prompt defers while the user is on one of these
 *     (`isOnSensitiveRoute`, services/pwa/pwaUpdate.ts);
 *   - the onboarding guard never redirects from one (ExhibitorOnboardingChecker).
 * Add a new show-day route here and both stay off it.
 *
 * INTENT: a judge at the ring must land on the scoresheet, never on an update
 * prompt or a setup form ("invisible technology", docs/INTENT.md).
 */
const SENSITIVE_PATH_PATTERNS: readonly RegExp[] = [
  // Payment and entry flows.
  /^\/checkout\//,
  /^\/shows\/[^/]+\/register(\/|$)/,
  /^\/secretary\/register\//,
  // Ringside scoring and gate stewarding (bare /at-show is the ringside landing).
  /^\/at-show(\/|$)/,
  // Secretary/judge scoring: the class entries list and each scoresheet.
  /^\/scoring\//,
  // Secretary's live class dashboard (judges and secretaries during a class).
  /^\/shows\/[^/]+\/trials\/[^/]+\/classes\/[^/]+\/secretary(\/|$)/,
  // TV display: unattended, nobody to answer a prompt or a form.
  /^\/tv\//,
];

export function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(pathname));
}
