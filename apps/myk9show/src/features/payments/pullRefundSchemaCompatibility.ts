interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

const MISSING_SCHEMA_CODES = new Set(['42703', 'PGRST202', 'PGRST204']);
const PULL_REFUND_SCHEMA_TARGET =
  /refund_decision|refund_decided_at|refund_decided_by|set_entry_refund_decision/i;
const MISSING_SCHEMA_MESSAGE = /does not exist|schema cache|could not find/i;

/** True only when the migration-backed pull-refund schema is unavailable. */
export function isPullRefundSchemaUnavailable(
  error: PostgrestErrorLike | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  if (!PULL_REFUND_SCHEMA_TARGET.test(message)) return false;
  return MISSING_SCHEMA_CODES.has(error.code ?? '') || MISSING_SCHEMA_MESSAGE.test(message);
}
