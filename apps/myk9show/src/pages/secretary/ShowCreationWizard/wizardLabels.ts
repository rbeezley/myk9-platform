/**
 * Edit-mode label helpers for the Show Creation Wizard.
 *
 * The wizard runs in four modes: a fresh create plus three edit modes
 * (`add-trials`, `add-classes`, `edit-show`). The header breadcrumb, the
 * sidebar heading, and the Review step's completion button each render a
 * mode-specific label. Centralizing the mapping here keeps those call sites
 * in sync.
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

/** Label for the Review step's single completion action. */
export function getSubmitLabel(mode: EditModeType | undefined): string {
  if (mode === 'add-trials') return 'Add Trials';
  if (mode === 'add-classes') return 'Add Classes';
  return 'Create Show';
}
