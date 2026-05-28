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

// PR E2d-2b — EntryListContent drag-and-drop grid wrapper. DogCard
// is a required slot prop (passed through to SortableEntryCard).
export { EntryListContent } from './EntryListContent';
export type { EntryListContentProps } from './EntryListContent';

// PR E2d-2b — EntryListHeader. Six UI primitives are required slot
// props (HamburgerMenu, CompactOfflineIndicator, SyncIndicator,
// RefreshIndicator, FilterTriggerButton, ClassDetailsPopover).
export { EntryListHeader } from './EntryListHeader';
export type { EntryListHeaderProps } from './EntryListHeader';

// PR E2d-2b — EntryListDialogs. Nine dialog components are required
// slot props. Auth context dropped entirely — `hideMaxTimeOption` and
// `hideSettingsOption` arrive precomputed from the shim.
export { EntryListDialogs } from './EntryListDialogs';
export type { EntryListDialogsProps } from './EntryListDialogs';

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
