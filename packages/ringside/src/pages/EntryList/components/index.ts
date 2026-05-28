/**
 * Component sub-tree for the EntryList page in @myk9/ringside.
 *
 * PR E2d-2a — leaf components moved from apps/myk9q:
 *  - FloatingDoneButton, ResetConfirmDialog, ResetMenuPopup,
 *    SelfCheckinDisabledDialog, SuccessToast.
 *
 * These are pure-presentational React components with no host
 * couplings beyond the ringside `Entry` type. They're consumed by the
 * EntryList page tree (still landing in PR E2d-2b) and by the host
 * shims at apps/myk9q/src/pages/EntryList/components/* that re-export
 * them for callers using the legacy import paths.
 *
 * Imports should target `@myk9/ringside`, not these subpaths.
 */

export { FloatingDoneButton } from './FloatingDoneButton';
export type { FloatingDoneButtonProps } from './FloatingDoneButton';

export { ResetConfirmDialog } from './ResetConfirmDialog';
export type { ResetConfirmDialogProps } from './ResetConfirmDialog';

export { ResetMenuPopup } from './ResetMenuPopup';
export type { ResetMenuPopupProps } from './ResetMenuPopup';

export { SelfCheckinDisabledDialog } from './SelfCheckinDisabledDialog';
export type { SelfCheckinDisabledDialogProps } from './SelfCheckinDisabledDialog';

export { SuccessToast } from './SuccessToast';
export type { SuccessToastProps } from './SuccessToast';

// Header helper components (action menu, trial info, status/section
// badges). Used by EntryListHeader.tsx which arrives in E2d-2b.
export {
  ActionsDropdownMenu,
  TrialInfo,
  ClassStatusBadge,
  SectionsBadge,
  getStatusBadge,
} from './entryListHeaderHelpers';
export type {
  PrintOption,
  ActionsMenuConfig,
} from './entryListHeaderHelpers';
