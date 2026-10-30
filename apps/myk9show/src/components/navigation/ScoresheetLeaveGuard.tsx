/**
 * The one "Discard this score?" prompt (MYK9-1500). A scoresheet reports whether
 * leaving would lose work; this guard then stops every way out: Up, Cancel and
 * the in-app back gesture through the router blocker, and a tab close or a back
 * out of the app through `beforeunload`.
 */
import { useEffect } from 'react';
import { UnsavedChangesRouteGuard, type SelfNavigationRef } from './UnsavedChangesRouteGuard';

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
  /** Raised around a navigation the page makes itself, e.g. leaving after a save. */
  selfNavigationRef?: SelfNavigationRef;
}) {
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers only show the prompt when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

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
