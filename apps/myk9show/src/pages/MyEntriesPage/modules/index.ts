/**
 * MyEntriesPage modules barrel export
 * @module MyEntriesPage
 */

// Types
export * from './my-entries-types';

// Hooks
export { useMyEntriesData } from './useMyEntriesData';
export { useMyEntriesFilters } from './useMyEntriesFilters';
export { useMyEntriesDialogs } from './useMyEntriesDialogs';
export {
  useResultReveal,
  collectSeenResultReleaseKeys,
  findResultRevealModel,
  RESULT_ENTRY_ID_PARAM,
} from './useResultReveal';

// Utils
export {
  getEntryStatusBadge,
  getPaymentStatusBadge,
  getStatusIcon,
  getContextualStatusMessage,
} from './myEntriesUtils';

// Constants & copy
export { EntryFilterStrip } from './EntryFilterStrip';
export {
  ENTRY_STATUS_FILTER_DEFS,
  ENTRY_TAB_DEFS,
  isEntryStatusFilter,
  isEntryTabFilter,
  legacyTabAsStatusFilter,
} from './entryTabDefs';
export { resolveWaitlistSurface } from './waitlistSurface';
export type { WaitlistSurface, WaitlistSurfaceInput } from './waitlistSurface';
export { ALL_ENTRIES_LABEL, ALL_ENTRIES_SCOPE_NOTE } from './myShowsCopy';
export { MyShowsListHeading } from './MyShowsListHeading';
export { buildScopedPaymentFacts } from './scopedPaymentFacts';
export type { ScopedPaymentFacts, ScopedPaymentFactRow } from './scopedPaymentFacts';

// Components
export { MyShowsList, useMyShowGroups } from './MyShowsList';
export { MyShowActionsMenu } from './MyShowActionsMenu';
export { buildMyShowActions } from './myShowActions';
export type { MyShowAction, MyShowActionId, MyShowActionsFacts } from './myShowActions';
export { canLeaveClassRow } from './leaveClassRow';
export { EntriesEmptyState } from './EntriesEmptyState';
export { EntryScopeBanner } from './EntryScopeBanner';
export { ScopedPaymentSummary } from './ScopedPaymentSummary';
export { EntriesLoadErrorCard } from './EntriesLoadErrorCard';
export { EntriesIdentityPendingCard } from './EntriesIdentityPendingCard';
export {
  UnconfirmedReadNotice,
  UNCONFIRMED_READ_HEADLINE,
  UNCONFIRMED_EMPTY_HEADLINE,
  UNCONFIRMED_EMPTY_DETAIL,
} from './UnconfirmedReadNotice';
export {
  CheckInDialog,
  EditEntryDialog,
  ReceiptEntryDialog,
  MyEntriesDialogGroup,
} from './MyEntriesDialogs';
export { LeaveClassDialog } from './LeaveClassDialog';
export { WaitListSection } from './WaitListSection';
export { MyEntriesOverview } from './MyEntriesOverview';
export type { OverviewDog } from './MyEntriesOverview';
