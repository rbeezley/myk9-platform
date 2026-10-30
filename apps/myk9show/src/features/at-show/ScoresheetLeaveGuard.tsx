/**
 * Holds the browser/device back gesture, which bypasses the scoresheet's Up and
 * Cancel, to the same "Discard this score?" prompt (MYK9-1500).
 */
import {
  UnsavedChangesRouteGuard,
  type SelfNavigationRef,
} from '@/components/navigation/UnsavedChangesRouteGuard';

/** Same words as the scoresheet's own Up/Cancel prompt. */
const DISCARD_SCORE_COPY = {
  title: 'Discard this score?',
  description: 'The time or result you entered for this dog has not been saved.',
  stayLabel: 'Keep scoring',
  leaveLabel: 'Discard',
};

export function ScoresheetLeaveGuard({
  isDirty,
  selfNavigationRef,
}: {
  isDirty: boolean;
  selfNavigationRef: SelfNavigationRef;
}) {
  return (
    <UnsavedChangesRouteGuard
      isDirty={isDirty}
      subject="this score"
      dialog={DISCARD_SCORE_COPY}
      selfNavigationRef={selfNavigationRef}
      pathScoped
    />
  );
}
