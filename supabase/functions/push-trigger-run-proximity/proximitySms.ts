/**
 * proximitySms — the channel decision and the two-channel dispatch for the
 * ring-proximity alert (MYK9-193).
 *
 * WHY SMS EXISTS ALONGSIDE PUSH. Not reach on uninstalled PWAs — carrier SMS
 * delivers at a venue where the exhibitor's data connection does not, which is
 * the same reason ringside is offline-first. That makes SMS a SIBLING of push,
 * never a fallback: the server cannot detect "the handset had no data", because
 * a push handed to the browser vendor is not a delivery confirmation. Building
 * "SMS only if push failed" would suppress the message in exactly the scenario
 * it exists for.
 *
 * WHY THE CHANNEL DECISION IS PER RECIPIENT. The trigger used to drop a watcher
 * before any channel was chosen (`if (pref.push_enabled === false) continue`).
 * With SMS attached that silently excludes the most likely SMS user of all: the
 * exhibitor who turned push off precisely because it never arrives at this
 * venue. `upcoming_runs = false` is still a global mute of the feature;
 * `push_enabled = false` may only suppress the push channel.
 *
 * WHY THE DEFAULTS INVERT PER CHANNEL. A missing notification_preferences row
 * means "the table defaults are the intent" for push — on. For SMS a missing
 * row means there is NO CONSENT RECORD, which is a hard no; the
 * notification_preferences_sms_consent_complete constraint guarantees
 * sms_enabled cannot be true without one. Do not reach for the
 * `pref?.field ?? default` idiom here.
 */

import { buildProximitySms, estimateSegments } from '../_shared/sms/smsMessage.ts';
import { smsDeliveryState } from '../_shared/sms/smsProvider.ts';
import type { ProximityRecipient } from './runProximity.ts';

export const DEFAULT_LEAD_DOGS = 3;

/** The subset of notification_preferences the send path reads. */
export interface ProximityPreferenceRow {
  auth_user_id: string;
  push_enabled: boolean | null;
  upcoming_runs: boolean | null;
  lead_dogs: number | null;
  sms_enabled: boolean | null;
  sms_phone_e164: string | null;
  sms_opt_out_at: string | null;
}

export const PROXIMITY_PREFERENCE_COLUMNS =
  'auth_user_id, push_enabled, upcoming_runs, lead_dogs, sms_enabled, sms_phone_e164, sms_opt_out_at';

export interface ChannelDecision {
  push: boolean;
  sms: boolean;
  /** The consented number, present only when `sms` is true. */
  smsPhone: string | null;
  leadDogs: number;
}

/**
 * Which channels this account gets. `undefined` means no preferences row.
 */
export function decideChannels(
  pref: ProximityPreferenceRow | undefined,
  defaultLeadDogs = DEFAULT_LEAD_DOGS
): ChannelDecision {
  const leadDogs = pref?.lead_dogs ?? defaultLeadDogs;

  // Global mute — the user turned the whole feature off, or an inbound STOP did
  // it for them (MYK9-192 decision B). Neither channel fires.
  if (pref?.upcoming_runs === false) {
    return { push: false, sms: false, smsPhone: null, leadDogs };
  }

  // Absent row = table defaults = push on.
  const push = pref ? pref.push_enabled !== false : true;

  // Absent row = no consent = SMS off.
  // `sms_enabled === true` on an OPTIONAL row is what makes the absent row a
  // no: undefined is not true. Every other condition is positive too — nothing
  // here defaults to sending.
  const phone = pref?.sms_phone_e164?.trim() ?? '';
  const sms = pref?.sms_enabled === true && !pref.sms_opt_out_at && phone !== '';

  return { push, sms, smsPhone: sms ? phone : null, leadDogs };
}

/** Per-entry text inputs for the message, resolved by the caller. */
export interface ProximityAlertContext {
  dogName: string;
  className: string;
  armband: number | null;
}

export interface ProximityDispatchPorts {
  sendPush(recipient: ProximityRecipient, context: ProximityAlertContext): Promise<unknown>;
  /**
   * Records that this (account, entry) is being texted. False means somebody
   * already claimed it — an earlier position in the same countdown — and this
   * invocation must not send.
   */
  claimSms(authUserId: string, entryId: string): Promise<boolean>;
  sendSms(input: { to: string; body: string }): Promise<unknown>;
  /** Undo a claim whose send failed, so the one allowed text is not lost. */
  releaseSms(authUserId: string, entryId: string): Promise<unknown>;
}

export interface ProximityDispatchDeps {
  channelFor(authUserId: string): ChannelDecision;
  contextFor(entryId: string): ProximityAlertContext;
  ports: ProximityDispatchPorts;
  /** False when the provider is unconfigured — push must still go out. */
  smsAvailable: boolean;
}

export interface ProximityDispatchResult {
  pushSent: number;
  pushFailed: number;
  smsSent: number;
  smsFailed: number;
  /** Already alerted for this entry, or over one segment. */
  smsSkipped: number;
  /**
   * Sends that failed in a way that cannot prove the message was NOT accepted,
   * so the exactly-once claim was deliberately kept. Counted separately from
   * `smsFailed` because it is the operator's only signal that an exhibitor may
   * have silently lost their one text — and, if it ever spikes, that the
   * provider is timing out rather than refusing.
   */
  smsUnconfirmed: number;
}

/**
 * Fire every channel for every recipient.
 *
 * The push and SMS calls are siblings in ONE `Promise.allSettled`: an SMS
 * provider outage must not suppress push, and a push-service outage must not
 * suppress SMS. Nothing here awaits one before starting the other.
 */
export async function dispatchProximityAlerts(
  recipients: readonly ProximityRecipient[],
  deps: ProximityDispatchDeps
): Promise<ProximityDispatchResult> {
  const result: ProximityDispatchResult = {
    pushSent: 0,
    pushFailed: 0,
    smsSent: 0,
    smsFailed: 0,
    smsSkipped: 0,
    smsUnconfirmed: 0,
  };

  const tasks: Promise<void>[] = [];

  for (const recipient of recipients) {
    const channels = deps.channelFor(recipient.authUserId);
    const context = deps.contextFor(recipient.entryId);

    if (channels.push) {
      tasks.push(
        deps.ports.sendPush(recipient, context).then(
          () => {
            result.pushSent += 1;
          },
          error => {
            result.pushFailed += 1;
            console.error('push-trigger-run-proximity: push send failed', errorMessage(error));
          }
        )
      );
    }

    if (channels.sms && deps.smsAvailable && channels.smsPhone) {
      tasks.push(sendOneSms(recipient, context, channels.smsPhone, deps, result));
    }
  }

  await Promise.allSettled(tasks);
  return result;
}

async function sendOneSms(
  recipient: ProximityRecipient,
  context: ProximityAlertContext,
  to: string,
  deps: ProximityDispatchDeps,
  result: ProximityDispatchResult
): Promise<void> {
  const body = buildProximitySms({
    dogName: context.dogName,
    className: context.className,
    dogsAhead: recipient.dogsAhead,
    armband: context.armband,
  });

  // Checked BEFORE the claim so a message we refuse to send does not consume
  // the entry's one allowed text. buildProximitySms trims the class name to fit
  // one segment, so more than one here means that guarantee broke — log it
  // rather than quietly paying twice for a message nobody asked to be longer.
  const estimate = estimateSegments(body);
  if (estimate.segments !== 1) {
    result.smsSkipped += 1;
    console.error(
      'push-trigger-run-proximity: refusing multi-segment SMS',
      JSON.stringify({
        segments: estimate.segments,
        encoding: estimate.encoding,
        length: estimate.length,
        entryId: recipient.entryId,
      })
    );
    return;
  }

  let claimed = false;
  try {
    claimed = await deps.ports.claimSms(recipient.authUserId, recipient.entryId);
  } catch (error) {
    result.smsFailed += 1;
    console.error('push-trigger-run-proximity: SMS claim failed', errorMessage(error));
    return;
  }

  // Already texted for this entry — push keeps counting down, SMS does not.
  if (!claimed) {
    result.smsSkipped += 1;
    return;
  }

  try {
    await deps.ports.sendSms({ to, body });
    result.smsSent += 1;
  } catch (error) {
    result.smsFailed += 1;
    console.error('push-trigger-run-proximity: SMS send failed', errorMessage(error));

    // RELEASE ONLY WHAT WE KNOW WAS NOT SENT (MYK9-193 review). Releasing on
    // any failure looks generous and is a duplicate-billing bug: Twilio bills
    // at acceptance, and a timeout or an unparseable 2xx means the message may
    // already be queued. Release then, and the very next countdown position —
    // seconds later — claims again and sends a second text, for every
    // recipient at once, precisely while the provider is struggling.
    if (smsDeliveryState(error) !== 'not-sent') {
      result.smsUnconfirmed += 1;
      console.warn(
        'push-trigger-run-proximity: keeping the SMS claim, delivery unconfirmed',
        JSON.stringify({ entryId: recipient.entryId })
      );
      return;
    }

    try {
      await deps.ports.releaseSms(recipient.authUserId, recipient.entryId);
    } catch (releaseError) {
      console.error(
        'push-trigger-run-proximity: SMS claim release failed',
        errorMessage(releaseError)
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
