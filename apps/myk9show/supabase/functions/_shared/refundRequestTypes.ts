// Types shared by the refund queue helpers (refundRequests.ts and the
// per-kind modules beside it).

/** refund_requests.kind (refund_requests_kind_check; latest in 20261128054100). */
export type RefundRequestKind =
  | 'abandoned_cart'
  | 'entry_payment_link'
  | 'cart_overflow'
  | 'unfulfilled_charge'
  | 'duplicate_subscription';

/** The alertAdmin options the queue helpers pass (a subset of AlertAdminOptions). */
export interface RefundAlertOptions {
  source: string;
  dedupeKey: string;
  detail?: Record<string, unknown>;
  /** One email per alert: a deduped re-raise stores nothing and sends nothing. */
  skipEmailOnDuplicate?: boolean;
}
