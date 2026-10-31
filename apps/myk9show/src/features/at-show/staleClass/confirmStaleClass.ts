/**
 * "Mark absent & complete" (MYK9-1514): re-check against synced state, then mark only the
 * dogs that are still unscored absent. The class completes through the server's own
 * derivation once every dog is accounted for; nothing here sets a class status.
 */
import type { StaleClassCandidate } from './detectStaleClass';
import type { StaleClassPrompt } from './staleClassPromptStore';

export type ConfirmStaleClassResult =
  | { outcome: 'marked'; className: string; markedCount: number }
  /** The class no longer qualifies on fresh data: nothing was changed. */
  | { outcome: 'not-needed'; className: string };

export async function confirmStaleClass(
  prompt: StaleClassPrompt,
  deps: {
    recheck: (prompt: StaleClassPrompt) => Promise<StaleClassCandidate | null>;
    markAbsent: (entryId: string, classId: string, className: string) => Promise<void>;
    /** Runs after the dogs are written; completes a class the server will not derive (manual status). */
    completeIfManual: (classId: string) => Promise<void>;
  }
): Promise<ConfirmStaleClassResult> {
  const fresh = await deps.recheck(prompt);
  if (!fresh) return { outcome: 'not-needed', className: prompt.className };
  for (const entryId of fresh.unscoredEntryIds) {
    await deps.markAbsent(entryId, fresh.classId, fresh.className);
  }
  await deps.completeIfManual(fresh.classId);
  return {
    outcome: 'marked',
    className: fresh.className,
    markedCount: fresh.unscoredEntryIds.length,
  };
}
