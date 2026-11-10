/**
 * MYK9-1844: what the entry wizard says when a secretary's payment-status or
 * entry-status change does not save. The thrown text is never shown; it goes to
 * the logger. The handlers only change the wizard's own copy of the registration,
 * so nothing outside the wizard needs checking and trying again is safe.
 */
import { ensureError } from '@myk9/core';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';

export type StatusSaveKind = 'payment' | 'entry';

export const STATUS_SAVE_FAILED: Record<StatusSaveKind, string> = {
  payment: "We couldn't change the payment status. Try again.",
  entry: "We couldn't change the entry status. Try again.",
};

/** Logs the raw error and tells the secretary, in a fixed sentence, which status did not save. */
export function notifyStatusSaveFailed(kind: StatusSaveKind, error: unknown): void {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  logger.error(
    `Registration workflow: ${kind} status change failed`,
    'components',
    typeof code === 'string' ? { code } : {},
    ensureError(error)
  );
  notifications.error(STATUS_SAVE_FAILED[kind]);
}
