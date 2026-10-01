import { UnsavedChangesRouteGuard } from '@/components/navigation/UnsavedChangesRouteGuard';
import type { SelfNavigationRef } from '@/components/navigation/UnsavedChangesRouteGuard';
import type { EditMode } from './show-creation-wizard-types';

interface WizardEditModeGuardProps {
  editMode: EditMode | undefined;
  /** `hasUnsavedEditWork(...)`: the one predicate every exit path shares. */
  hasUnsavedWork: boolean;
  selfNavigationRef: SelfNavigationRef;
}

/**
 * Edit-mode wizards (add-classes / add-trials) have no resumable draft: reopening rebuilds it
 * from what is stored, so leaving silently loses the work. Create mode persists its draft and
 * is deliberately not guarded. This is the guard the retired Add Classes panel carried.
 */
export function WizardEditModeGuard({
  editMode,
  hasUnsavedWork,
  selfNavigationRef,
}: WizardEditModeGuardProps) {
  if (!editMode) return null;
  return (
    <UnsavedChangesRouteGuard
      isDirty={hasUnsavedWork}
      subject={
        editMode.mode === 'add-classes' ? 'the classes you selected' : 'the trials you added'
      }
      selfNavigationRef={selfNavigationRef}
    />
  );
}
