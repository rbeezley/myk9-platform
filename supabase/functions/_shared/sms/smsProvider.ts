export interface SmsSendInput {
  to: string;
  body: string;
}

export interface SmsSendResult {
  messageId: string;
}

export interface SmsProvider {
  send(input: SmsSendInput): Promise<SmsSendResult>;
}

/**
 * Whether a failed send left a message the carrier may still deliver.
 *
 * This distinction is money (MYK9-193 review). The proximity trigger claims an
 * exactly-once marker BEFORE sending and releases it if the send fails, so the
 * exhibitor does not lose their one text to a provider blip. But releasing on
 * an error that occurred AFTER the provider accepted the message re-opens the
 * duplicate the marker exists to prevent — and Twilio is billed at acceptance,
 * not at delivery.
 *
 *   'not-sent'  the provider refused it. Nothing is queued, nothing is billed,
 *               so the claim is safe to release.
 *   'unknown'   the provider may already hold it: a timeout that fired while
 *               the request was in flight, a socket error, or a response that
 *               was 2xx but did not parse. The claim MUST stand.
 *
 * The asymmetry is deliberate. A released-too-eagerly claim costs a duplicate
 * charge on every remaining countdown position and burns campaign-cap headroom
 * exactly when the provider is already struggling — i.e. for every recipient at
 * once. A claim held too long costs one missed text, while push still delivers
 * the full countdown. Missing an alert is the cheaper mistake.
 */
export type SmsDeliveryState = 'not-sent' | 'unknown';

export class SmsSendError extends Error {
  readonly deliveryState: SmsDeliveryState;

  constructor(message: string, deliveryState: SmsDeliveryState) {
    super(message);
    this.name = 'SmsSendError';
    this.deliveryState = deliveryState;
  }
}

/**
 * Classify a thrown value. Anything that is not an `SmsSendError` is 'unknown'
 * on purpose: an unclassified throw is exactly the case where we cannot prove
 * nothing was sent, and the default must be the one that cannot double-bill.
 */
export function smsDeliveryState(error: unknown): SmsDeliveryState {
  return error instanceof SmsSendError ? error.deliveryState : 'unknown';
}
