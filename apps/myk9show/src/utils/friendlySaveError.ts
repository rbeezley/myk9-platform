import { friendlyDbError, isPermissionDbError } from '@/utils/friendlyDbError';
import { mappedErrorMessage } from '@/utils/errorMessages';

/** Title of every failed-save toast, so a failed save reads the same on every surface. */
export const SAVE_FAILED_TITLE = "Couldn't save your changes";

const KEEP_EDITING = 'Your changes are still here.';
const TRY_AGAIN = 'Try again.';

/**
 * An error whose message was written for a person, so it may be shown as is.
 * Every other thrown value is treated as possibly carrying database text and is
 * replaced with generic copy.
 */
export class FriendlySaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendlySaveError';
  }
}

const PLATFORM_BOILERPLATE = /row-level security|permission denied|unauthorized|not authorized/i;

/**
 * Our own guards refuse with `RAISE EXCEPTION '<sentence>' USING errcode =
 * '42501'` (for example MYK9-710's "only a site admin can change their email
 * address"). That sentence is the explanation, so it is kept. The platform's own
 * 42501 text ("new row violates row-level security policy ...") is not.
 */
function authoredRefusal(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code !== '42501' || typeof message !== 'string') return undefined;
  const sentence = message.trim();
  if (!sentence || PLATFORM_BOILERPLATE.test(sentence)) return undefined;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export interface FriendlySaveFeedback {
  title: string;
  description: string;
}

/**
 * The toast copy for a failed save (H1): what went wrong when we can say so
 * safely, then that the work is still on screen. A permission refusal does not
 * say "Try again", because the same click will be refused again.
 */
export function friendlySaveError(error: unknown): FriendlySaveFeedback {
  if (isPermissionDbError(error)) {
    return {
      title: SAVE_FAILED_TITLE,
      description: `${authoredRefusal(error) ?? friendlyDbError(error)} ${KEEP_EDITING}`,
    };
  }

  const detail =
    error instanceof FriendlySaveError
      ? error.message
      : (mappedErrorMessage(error) ?? (friendlyDbError(error, '') || undefined));

  return {
    title: SAVE_FAILED_TITLE,
    description: `${detail ? `${detail} ` : ''}${KEEP_EDITING} ${TRY_AGAIN}`,
  };
}
