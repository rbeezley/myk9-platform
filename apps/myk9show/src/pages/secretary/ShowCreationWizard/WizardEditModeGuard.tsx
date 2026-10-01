import { UnsavedChangesRouteGuard } from '@/components/navigation/UnsavedChangesRouteGuard';
import type { SelfNavigationRef } from '@/components/navigation/UnsavedChangesRouteGuard';
import { countUnsavedClassSelections } from './classConfigurationValidation';
import type { PersistedClassIdentity } from './classConfigurationValidation';
import type { WizardTrial } from './showCreationWizardTransformers';
import type { EditMode } from './show-creation-wizard-types';

interface WizardEditModeGuardProps {
  editMode: EditMode | undefined;
  /** The wizard store's dirty flag (any edit since the draft was loaded). */
  isDirty: boolean;
  trials: readonly WizardTrial[];
  persistedClasses: readonly PersistedClassIdentity[];
  selfNavigationRef: SelfNavigationRef;
}

/**
 * Edit-mode wizards (add-classes / add-trials) have no resumable draft: reopening rebuilds it
 * from what is stored, so leaving silently loses the work. Create mode persists its draft and
 * is deliberately not guarded. This is the guard the retired Add Classes panel carried.
 *
 * add-classes is dirty only while unsaved class selections exist (a freshly loaded draft, or
 * one that only re-synced judges, is clean); add-trials uses the store's dirty flag.
 */
export function WizardEditModeGuard({
  editMode,
  isDirty,
  trials,
  persistedClasses,
  selfNavigationRef,
}: WizardEditModeGuardProps) {
  if (!editMode) return null;
  const adding = editMode.mode === 'add-classes';
  const dirty = adding ? countUnsavedClassSelections(trials, persistedClasses) > 0 : isDirty;
  return (
    <UnsavedChangesRouteGuard
      isDirty={dirty}
      subject={adding ? 'the classes you selected' : 'the trials you added'}
      selfNavigationRef={selfNavigationRef}
    />
  );
}
