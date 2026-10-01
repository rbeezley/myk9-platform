import { countUnsavedClassSelections } from './classConfigurationValidation';
import type { PersistedClassIdentity } from './classConfigurationValidation';
import type { WizardTrial } from './showCreationWizardTransformers';
import type { EditMode } from './show-creation-wizard-types';

/**
 * THE definition of "the secretary has unsaved work in this wizard". The route guard, header
 * Back, step Back, Close and the draft-initialization clobber guard all ask this and nothing
 * else, so they can never disagree about whether leaving costs her something.
 *
 * - add-classes: only class selections that are not stored classes count. The store's dirty
 *   flag is useless here: the class step auto-assigns a lone judge and marks the store dirty
 *   with nothing for her to lose, and a routine "unsaved changes?" prompt there is noise.
 * - add-trials and create: the store's dirty flag, as always.
 */
export function hasUnsavedEditWork(input: {
  editMode: EditMode | undefined;
  /** The wizard store's `isDirty`. */
  storeIsDirty: boolean;
  trials: readonly WizardTrial[];
  /** The show's stored classes (add-classes: retained, not "new"). */
  persistedClasses: readonly PersistedClassIdentity[];
}): boolean {
  if (input.editMode?.mode === 'add-classes') {
    return countUnsavedClassSelections(input.trials, input.persistedClasses) > 0;
  }
  return input.storeIsDirty;
}
