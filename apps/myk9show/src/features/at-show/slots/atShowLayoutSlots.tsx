import { DogCard, type EntryListLayoutSlots } from '@myk9/ringside';
import { ClassDetailsPopover } from './ClassDetailsPopoverSlot';
import {
  CompactOfflineIndicator,
  ErrorState,
  FilterPanel,
  FilterTriggerButton,
  PullToRefresh,
  RefreshIndicator,
  SyncIndicator,
} from './atShowLayoutSlotComponents';

export const atShowLayoutSlots: EntryListLayoutSlots = {
  CompactOfflineIndicator,
  SyncIndicator,
  RefreshIndicator,
  FilterTriggerButton,
  FilterPanel,
  DogCard,
  PullToRefresh,
  ErrorState,
  ClassDetailsPopover,
};
