/**
 * Kill switch for the SMS ring-alert delivery option (MYK9-191/192/193).
 *
 * OFF by default. The SMS code is merged and correct, but text sending is
 * deliberately not live — `push-trigger-run-proximity` is not deployed and no
 * Twilio secret is set — so a text can never arrive. Showing an opt-in that
 * writes real consent and then delivers nothing is a promise the product cannot
 * keep, so the whole "Text message" option is hidden until SMS actually ships.
 *
 * Visibility gate only. Nothing is deleted or disabled server-side: the consent
 * service, the STOP webhook and `sms_proximity_sends` are untouched, so a STOP
 * already on record is still honoured.
 *
 * Evaluated at call time (not module load) so tests can flip it, matching
 * showEditAwarenessEnabled / showConflictSurfacingEnabled. Env override:
 * VITE_SMS_RING_ALERTS=true forces it on for a preview deploy without a code
 * change; =false forces it off even once the const flips.
 */

import { features } from '@/config/features';

export function smsRingAlertsEnabled(): boolean {
  if (import.meta.env?.VITE_SMS_RING_ALERTS === 'false') return false;
  return features.smsRingAlerts || import.meta.env?.VITE_SMS_RING_ALERTS === 'true';
}
