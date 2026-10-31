/**
 * "Mark absent & complete" (MYK9-1514): ONE server action with the dog ids the judge saw.
 * `ringside_complete_stale_class` marks exactly those dogs absent and lets the class complete
 * in a single transaction, or changes nothing and returns the dogs as they stand now. There is
 * no per-dog loop here to fail halfway; offline, the same single call is queued and the server
 * re-validates when it lands.
 */
import type { StaleClassPrompt } from './staleClassPromptStore';

export type CompleteStaleClassReply =
  { ok: true; markedCount: number } | { ok: false; currentEntryIds: string[] };

export type ConfirmStaleClassResult =
  | { outcome: 'marked'; className: string; markedCount: number }
  /** Offline: the one call is queued; the server checks the dogs when it syncs. */
  | { outcome: 'queued'; className: string; dogCount: number }
  /** Nothing is left to mark: the class no longer needs this. */
  | { outcome: 'not-needed'; className: string }
  /** The dogs changed since the judge looked: nothing was written; ask again with these. */
  | { outcome: 'changed'; className: string; currentEntryIds: string[] };

export async function confirmStaleClass(
  prompt: StaleClassPrompt,
  deps: {
    isOnline: () => boolean;
    complete: (classId: string, expectedEntryIds: string[]) => Promise<CompleteStaleClassReply>;
    queue: (classId: string, expectedEntryIds: string[]) => Promise<void>;
  }
): Promise<ConfirmStaleClassResult> {
  const { classId, className, unscoredEntryIds } = prompt;
  if (!deps.isOnline()) {
    await deps.queue(classId, unscoredEntryIds);
    return { outcome: 'queued', className, dogCount: unscoredEntryIds.length };
  }
  const reply = await deps.complete(classId, unscoredEntryIds);
  if (reply.ok) return { outcome: 'marked', className, markedCount: reply.markedCount };
  if (reply.currentEntryIds.length === 0) return { outcome: 'not-needed', className };
  return { outcome: 'changed', className, currentEntryIds: reply.currentEntryIds };
}
