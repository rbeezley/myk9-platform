/**
 * Edit-mode label helpers for the Show Creation Wizard.
 *
 * The wizard runs in four modes: a fresh create plus three edit modes
 * (`add-trials`, `add-classes`, `edit-show`). The header breadcrumb, the
 * sidebar heading, and the Review step's submit/publish buttons each render a
 * mode-specific label. Centralizing the mapping here keeps those three call
 * sites in sync — previously each inlined its own nested ternary.
 */
import type { EditMode, EditModeType } from './show-creation-wizard-types';

/**
 * Title for the header breadcrumb / sidebar heading in edit mode.
 * Returns `undefined` for a fresh create so callers can supply their own
 * default (the header uses "Wizard", the sidebar uses "Create New Show").
 */
export function getEditModeTitle(editMode: EditMode | undefined): string | undefined {
  if (!editMode) return undefined;
  switch (editMode.mode) {
    case 'add-trials':
      return 'Add Trials';
    case 'add-classes':
      return 'Add Classes';
    default:
      return 'Edit Show';
  }
}

/** Label for the Review step's "create without publishing" button. */
export function getSubmitLabel(mode: EditModeType | undefined): string {
  if (mode === 'add-trials') return 'Add Trials (Unpublished)';
  if (mode === 'add-classes') return 'Add Classes (Unpublished)';
  return 'Create Show (Unpublished)';
}

/** Label for the Review step's "create and publish" button. */
export function getPublishLabel(mode: EditModeType | undefined): string {
  if (mode === 'add-trials') return 'Add & Publish Trials';
  if (mode === 'add-classes') return 'Add & Publish Classes';
  return 'Create & Publish Show';
}
