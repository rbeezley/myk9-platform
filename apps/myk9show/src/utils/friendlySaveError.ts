import { mappedErrorMessage } from '@/utils/errorMessages';

/** Title of every failed-save toast, so a failed save reads the same on every surface. */
export const SAVE_FAILED_TITLE = "Couldn't save your changes";

const KEEP_EDITING = 'Your changes are still here.';
const TRY_AGAIN = 'Try again.';

/**
 * An error whose message was written for a person. Anything that is not
 * technical already shows its own message, so this is only needed to force a
 * message through that would otherwise read as technical.
 */
export class FriendlySaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendlySaveError';
  }
}

export interface FriendlySaveFeedback {
  title: string;
  description: string;
}

/** Text that is platform boilerplate: nothing in it a person can act on. */
const TECHNICAL_TEXT = new RegExp(
  [
    'row-level security',
    'permission denied',
    'unauthorized',
    'not authorized',
    '\\bjwt\\b',
    'violates .*constraint',
    'duplicate key value',
    'null value in column',
    'does not exist',
    'syntax error',
    'failed to fetch',
    'networkerror',
    'network request failed',
    'load failed',
    'fetch failed',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway time-?out',
  ].join('|'),
  'i'
);

const MAX_AUTHORED_LENGTH = 300;
const RETRYABLE_CODE = /^(08|40|53|57|PGRST)/;
const JS_RUNTIME_ERRORS = [TypeError, ReferenceError, SyntaxError, RangeError, EvalError];

interface Classified {
  /** The sentence to show, or undefined when only generic copy is honest. */
  detail: string | undefined;
  /** Whether the same click can succeed on a second try. */
  retryable: boolean;
}

function field(error: unknown, key: string): unknown {
  return error && typeof error === 'object' ? (error as Record<string, unknown>)[key] : undefined;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isTechnicalFailure(error: unknown): boolean {
  if (error instanceof FriendlySaveError) return false;
  if (isOffline()) return true;
  if (JS_RUNTIME_ERRORS.some(type => error instanceof type)) return true;
  const name = field(error, 'name');
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  const status = field(error, 'status') ?? field(error, 'statusCode');
  return typeof status === 'number' && status >= 500;
}

function classify(error: unknown): Classified {
  const code = typeof field(error, 'code') === 'string' ? (field(error, 'code') as string) : '';
  const retryable = RETRYABLE_CODE.test(code);
  if (isTechnicalFailure(error)) return { detail: undefined, retryable: true };

  const raw = typeof error === 'string' ? error : field(error, 'message');
  const message = typeof raw === 'string' ? raw.trim() : '';
  const authored =
    message !== '' && message.length <= MAX_AUTHORED_LENGTH && !TECHNICAL_TEXT.test(message);

  // An authored sentence beats a code-mapped one: our own guards raise with
  // SQLSTATEs the map also covers (42501, 23514, MK*) and the sentence is the
  // explanation. The map speaks only when the text is platform boilerplate.
  if (error instanceof FriendlySaveError || authored) {
    return { detail: /[.!?]$/.test(message) ? message : `${message}.`, retryable };
  }
  const mapped = mappedErrorMessage(error);
  if (mapped) return { detail: mapped, retryable };

  if (code === '42501') {
    return { detail: "You don't have permission to make that change.", retryable: false };
  }
  return { detail: undefined, retryable: true };
}

/**
 * The toast copy for a failed save (H1). Pure: logging happens once, where the
 * save is reported.
 *
 * It shows the error's own message by default, because authored guard messages
 * ("Entries for this show closed on ...") are the thing a person can act on. It
 * falls back to generic copy only for failures with nothing to act on: network
 * and transport errors, JS runtime errors, and raw platform errors. "Try again"
 * appears only when trying again can work; a refusal says why instead.
 */
export function friendlySaveError(error: unknown): FriendlySaveFeedback {
  const { detail, retryable } = classify(error);
  if (!detail) {
    return { title: SAVE_FAILED_TITLE, description: `${KEEP_EDITING} ${TRY_AGAIN}` };
  }
  const again = retryable && !/try again/i.test(detail) ? ` ${TRY_AGAIN}` : '';
  return { title: SAVE_FAILED_TITLE, description: `${detail} ${KEEP_EDITING}${again}` };
}

/** Just the sentence, for an inline error beside the form (no toast boilerplate). */
export function friendlySaveMessage(error: unknown): string {
  return classify(error).detail ?? "We couldn't save that. Try again.";
}
