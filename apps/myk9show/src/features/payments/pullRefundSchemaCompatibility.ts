interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

const MISSING_SCHEMA_CODES = new Set(['42703', 'PGRST202', 'PGRST204']);
const PULL_REFUND_SCHEMA_TARGET =
  /refund_decision|refund_decided_at|refund_decided_by|set_entry_refund_decision/i;
const MISSING_SCHEMA_MESSAGE = /does not exist|schema cache|could not find/i;

const SECRETARY_PAYMENT_SCHEMA_TARGET =
  /payment_reference|payment_received_on|payment_notes/i;

/**
 * True only when the migration-backed secretary payment bookkeeping columns are
 * unavailable (20260828200000). Lets the secretary read keep working against a
 * database where that migration has not been applied yet, the same way the
 * pull-refund columns already do.
 */
export function isSecretaryPaymentSchemaUnavailable(
  error: PostgrestErrorLike | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  if (!SECRETARY_PAYMENT_SCHEMA_TARGET.test(message)) return false;
  return MISSING_SCHEMA_CODES.has(error.code ?? '') || MISSING_SCHEMA_MESSAGE.test(message);
}

/** True only when the migration-backed pull-refund schema is unavailable. */
export function isPullRefundSchemaUnavailable(
  error: PostgrestErrorLike | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  if (!PULL_REFUND_SCHEMA_TARGET.test(message)) return false;
  return MISSING_SCHEMA_CODES.has(error.code ?? '') || MISSING_SCHEMA_MESSAGE.test(message);
}
