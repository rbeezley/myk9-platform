import { useEffect, useMemo, useState } from 'react';
import { UnsavedChangesRouteGuard } from '@/components/navigation/UnsavedChangesRouteGuard';
import {
  describeNoEntryYet,
  namesWithoutEntry,
} from '@/components/shows/RegistrationWorkflow/createdInSession';
import { useCreatedInSession } from '@/components/shows/RegistrationWorkflow/CreatedInSessionContext';

/**
 * INTENT: a secretary who created owners and dogs here must not lose track of
 * them by walking away before entries are submitted. In-app navigation gets our
 * dialog; closing or reloading the tab gets the browser's own prompt (its text
 * cannot be customised). Nothing is deleted on leaving, and no prompt appears
 * once entries are submitted (`submitted` is the receipt step, reached by the
 * online and the offline late-entry path alike) or when only existing dogs
 * were selected.
 */
export function WizardLeaveGuard({ submitted }: { submitted: boolean }) {
  const session = useCreatedInSession();
  const created = session?.created;
  // Sticky: once entries are submitted, clicking back to an earlier step must
  // not bring the warning back.
  const [everSubmitted, setEverSubmitted] = useState(false);
  if (submitted && !everSubmitted) setEverSubmitted(true);
  const pending =
    !submitted && !everSubmitted && !!created && namesWithoutEntry(created).length > 0;

  const dialog = useMemo(
    () => ({
      title: 'Leave without an entry?',
      description: created ? describeNoEntryYet(created) : '',
      stayLabel: 'Finish entry',
      leaveLabel: 'Leave without entry',
    }),
    [created]
  );

  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers only show the prompt when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  return (
    <UnsavedChangesRouteGuard isDirty={pending} subject="this entry" dialog={dialog} pathScoped />
  );
}
