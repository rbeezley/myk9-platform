/**
 * The refresh answer's two pieces, shared by the class picker and the entry
 * lists (MYK9-1746): the visible answer handed to the pinned entry header, and
 * the persistent live region that tells screen readers the same thing.
 */
import { CLASS_REFRESH_MESSAGES, type ClassRefreshPhase } from './useAtShowClassRefresh';

export interface AtShowRefreshAnswer {
  message: string;
  tone: 'ok' | 'warn';
}

/** The settled result worth showing; null while idle or still refreshing. */
export function getRefreshAnswer(phase: ClassRefreshPhase): AtShowRefreshAnswer | null {
  if (phase === 'idle' || phase === 'refreshing') return null;
  return { message: CLASS_REFRESH_MESSAGES[phase], tone: phase === 'done' ? 'ok' : 'warn' };
}

/** Always mounted, so a screen reader hears the change in its text. */
export function AtShowRefreshLiveRegion({ phase }: { phase: ClassRefreshPhase }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {phase === 'idle' ? '' : CLASS_REFRESH_MESSAGES[phase]}
    </div>
  );
}
