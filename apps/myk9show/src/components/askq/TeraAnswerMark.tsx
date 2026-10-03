import { useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';
import { TeraAvatar, TeraFace } from './TeraAvatar';

/**
 * Whether Tera should play "Found it" (MYK9-851): true from the moment a
 * pending answer completes SUCCESSFULLY until the clip ends. Call it from the
 * component that stays mounted from "working" through to the answer, never from
 * the mark itself: an answer whose text and completion land in one update
 * mounts its mark already complete. A failure or an escalation is not a
 * completion, so it keeps the plain face.
 */
export function useFoundIt(isPending: boolean, isComplete: boolean): [boolean, () => void] {
  const [wasPending, setWasPending] = useState(isPending);
  const [foundIt, setFoundIt] = useState(false);
  if (wasPending !== isPending) {
    setWasPending(isPending);
    setFoundIt(wasPending && !isPending && isComplete);
  }
  return [foundIt, () => setFoundIt(false)];
}

/**
 * An answer's sender mark: "Found it" once at 40px when `foundIt`, otherwise
 * Tera's static face. Reduced motion keeps the face; the answer text is already
 * on screen either way, so this never delays it.
 */
export function TeraAnswerMark({ foundIt, onDone }: { foundIt: boolean; onDone: () => void }) {
  const reducedMotion = useReducedMotion();
  if (foundIt && !reducedMotion) {
    return (
      <span data-testid="tera-found-it" className="flex-none">
        <TeraAvatar state="found-it" size={40} onEnded={onDone} />
      </span>
    );
  }
  return <TeraFace />;
}
