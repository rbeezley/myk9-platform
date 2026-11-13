/**
 * MYK9-1823: what the wizard's Submit says when sending an entry fails. Thrown
 * text from the database, the network or a library is never shown: it is written
 * for developers and does not say what to do next. A failure this flow words on
 * purpose is thrown as `PlainEntryError` and shown as it is; so are the few
 * refusals `submit_show_entries` words for the exhibitor, told apart by their
 * code. Everything else gets the fixed sentence for the path that failed.
 */
import {
  CAPACITY_UNREADABLE,
  SHOW_ENTRIES_UNREADABLE,
  STRUCTURE_NOT_LOADED,
} from './offlineLateEntryCopy';
import { OWNER_ADDRESS_REQUIRED_CODE } from './ownerAddress';

/** A failure worded on purpose for the person submitting; its message is shown as it is. */
export class PlainEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlainEntryError';
  }
}

/**
 * - `cardCheckout`: the wizard moving the entry into the cart for card payment.
 * - `exhibitorSubmit`: an exhibitor sending their own entry without a card.
 * - `organizerSubmit`: a secretary or club admin saving an entry for someone.
 */
export type EntrySubmitPath = 'cardCheckout' | 'exhibitorSubmit' | 'organizerSubmit';

export const ENTRY_SUBMIT_FAILED: Record<EntrySubmitPath, string> = {
  cardCheckout:
    'We could not get your entry ready to pay. Your choices are still here, and nothing was charged. Try again.',
  exhibitorSubmit:
    'We could not finish sending your entry. Check your entries to see if it arrived before you try again.',
  organizerSubmit:
    "We could not finish saving this entry. Check the show's Entry Forms tab to see what was saved before you try again.",
};

/**
 * `submit_show_entries` raises these class refusals as whole sentences for the
 * exhibitor (supabase/migrations/20261101213300_myk9_1637_card_money_received.sql),
 * under the same 42501 as its developer-only guards, so the code alone cannot
 * tell them apart. Anchored on the start of our own SQL text; a miss falls back.
 */
const CLASS_CLOSED_REFUSAL = /^This class (was cancelled|has already started|has finished),/;

/**
 * The offline late entry's device-read sentences. They are thrown through the
 * shared `rowsOrThrow` (whose error name a server fallback keys on), so they are
 * known by our own constant rather than by class.
 */
const DEVICE_READ_WORDED = new Set<string>([
  CAPACITY_UNREADABLE,
  STRUCTURE_NOT_LOADED,
  SHOW_ENTRIES_UNREADABLE,
]);

/** `ShowEntriesNotSyncedError` is known by its name, so this module stays free of the sync code. */
function isDeviceReadWorded(error: Error): boolean {
  return error.name === 'ShowEntriesNotSyncedError' || DEVICE_READ_WORDED.has(error.message);
}

function serverWordedMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof message !== 'string' || !message) return null;
  if (code === OWNER_ADDRESS_REQUIRED_CODE) return message;
  if (code === '42501' && CLASS_CLOSED_REFUSAL.test(message)) return message;
  return null;
}

/** A plain sentence for a failed Submit. Never the thrown text unless it was worded for people. */
export function entrySubmitErrorMessage(error: unknown, path: EntrySubmitPath): string {
  if (error instanceof PlainEntryError) return error.message;
  if (error instanceof Error && isDeviceReadWorded(error)) return error.message;
  return serverWordedMessage(error) ?? ENTRY_SUBMIT_FAILED[path];
}
