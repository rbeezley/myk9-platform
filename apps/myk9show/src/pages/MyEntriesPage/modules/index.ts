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

// Components
export { MyEntryCard } from './MyEntryCard';
export { EntriesEmptyState } from './EntriesEmptyState';
export { EntryScopeBanner } from './EntryScopeBanner';
export { EntriesLoadErrorCard } from './EntriesLoadErrorCard';
export { EntriesIdentityPendingCard } from './EntriesIdentityPendingCard';
export {
  CheckInDialog,
  EditEntryDialog,
  ReceiptEntryDialog,
  MyEntriesDialogGroup,
} from './MyEntriesDialogs';
export { WaitListSection } from './WaitListSection';
export { MyEntriesOverview } from './MyEntriesOverview';
export type { OverviewDog } from './MyEntriesOverview';
