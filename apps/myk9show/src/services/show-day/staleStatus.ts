import type { ExpectedEntryStatus } from '@myk9/ringside';

/**
 * The state a self check-in write expects to replace (MYK9-1911). The server refuses the write,
 * changing nothing, when the entry no longer matches.
 */
export type ExpectedCheckInState = ExpectedEntryStatus;

/** An exhibitor's Undo of their own Pull replaces exactly that Pull and nothing newer. */
export const EXHIBITOR_PULL_EXPECTED: ExpectedCheckInState = {
  status: 'pulled',
  pullSource: 'exhibitor',
};

/** SQLSTATE `object_not_in_prerequisite_state`, raised by `self_checkin_entry` for a stale write. */
const STALE_STATUS_CODE = '55000';

/** The entry changed since the write was composed, so the server refused it. Never retryable. */
export class StaleStatusError extends Error {
  /**
   * A client-error status: the app's mutation retry policy (`createAppQueryClient`) never retries
   * a 4xx, so a paused Undo replayed after reconnect fails once and is dropped, not retried.
   */
  readonly status = 409;

  constructor(cause?: unknown) {
    super('The entry changed after this write was started.');
    this.name = 'StaleStatusError';
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

export function isStaleStatusRefusal(error: unknown): boolean {
  if (error instanceof StaleStatusError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === STALE_STATUS_CODE && typeof message === 'string' && message.startsWith('Stale status:')
  );
}
