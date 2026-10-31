/**
 * "Mark absent & complete" (MYK9-1514): ONE server action with the dog ids the judge saw.
 * `ringside_complete_stale_class` marks exactly those dogs absent and lets the class complete
 * in a single transaction, or changes nothing and returns the dogs as they stand now. It is
 * online-only: with no connection nothing is marked and nothing is queued, so the judge simply
 * confirms again later. Detection (offline, from local data) is unaffected.
 */
import type { StaleClassPrompt } from './staleClassPromptStore';

/** Why the server refused: the dogs changed, a dog is in the ring, or the class left in_progress. */
export type StaleClassRefusal = 'changed' | 'in_ring' | 'not_in_progress';

export type CompleteStaleClassReply =
  | { ok: true; markedCount: number }
  | { ok: false; currentEntryIds: string[]; reason: StaleClassRefusal };

export type ConfirmStaleClassResult =
  | { outcome: 'marked'; className: string; markedCount: number }
  /** Nothing is left to mark: no unscored dogs remain. */
  | { outcome: 'not-needed'; className: string }
  /** A dog is in the ring, or the class is no longer in progress: nothing was written. */
  | { outcome: 'refused'; className: string; reason: 'in_ring' | 'not_in_progress' }
  /** The dogs changed since the judge looked: nothing was written; ask again with these. */
  | { outcome: 'changed'; className: string; currentEntryIds: string[] }
  /** No usable connection: nothing was marked or queued; the prompt stays open. */
  | { outcome: 'needs-connection'; className: string }
  /** A listed dog has a score queued on this device: the server would count it unscored. */
  | { outcome: 'scores-uploading'; className: string };

const NETWORK_MESSAGE =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|network error|timed? ?out|timeout|aborted|err_internet|offline/i;

/**
 * True for a transport failure (no route to the server, a dropped or timed-out request), judged
 * by the error rather than `navigator.onLine`, which stays true on venue Wi-Fi with no internet.
 * A PostgREST error carrying a SQLSTATE or PGRST code came back from the server, so it is not one.
 */
export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  if (typeof err !== 'object' || err === null) return false;
  const { code, message, name } = err as { code?: unknown; message?: unknown; name?: unknown };
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (typeof code === 'string' && code !== '') return false;
  return typeof message === 'string' && NETWORK_MESSAGE.test(message);
}

export async function confirmStaleClass(
  prompt: StaleClassPrompt,
  deps: {
    complete: (classId: string, expectedEntryIds: string[]) => Promise<CompleteStaleClassReply>;
    /** Entry ids with a score still queued on this device. */
    queuedScoreEntryIds: () => Promise<ReadonlySet<string>>;
  }
): Promise<ConfirmStaleClassResult> {
  const { classId, className, unscoredEntryIds } = prompt;
  // A dog scored offline whose score has not uploaded yet is still unscored on the server,
  // so confirming now would mark a real run absent. Wait for the upload instead.
  const queued = await deps.queuedScoreEntryIds();
  if (unscoredEntryIds.some(id => queued.has(id))) {
    return { outcome: 'scores-uploading', className };
  }
  let reply: CompleteStaleClassReply;
  try {
    reply = await deps.complete(classId, unscoredEntryIds);
  } catch (err) {
    if (isNetworkFailure(err)) return { outcome: 'needs-connection', className };
    throw err;
  }
  if (reply.ok) return { outcome: 'marked', className, markedCount: reply.markedCount };
  if (reply.reason === 'in_ring' || reply.reason === 'not_in_progress') {
    return { outcome: 'refused', className, reason: reply.reason };
  }
  if (reply.currentEntryIds.length === 0) return { outcome: 'not-needed', className };
  return { outcome: 'changed', className, currentEntryIds: reply.currentEntryIds };
}
