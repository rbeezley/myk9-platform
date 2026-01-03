// Entry Sync UI Components for Phase 3 Local-First Implementation
// These components provide comprehensive sync status monitoring, payment processing,
// conflict resolution, offline entry creation, and performance metrics.

export { 
  EntrySyncStatusBar,
  ShowEntrySyncBar,
  ClassEntrySyncBar,
  default as EntrySyncStatusBarDefault
} from './EntrySyncStatusBar';

export { 
  PaymentPendingIndicator,
  EntryPaymentIndicator,
  PaymentQueueIndicator,
  default as PaymentPendingIndicatorDefault,
  type PaymentStatus
} from './PaymentPendingIndicator';

export { 
  EntryConflictResolutionWizard,
  default as EntryConflictResolutionWizardDefault
} from './EntryConflictResolutionWizard';

export { 
  OfflineEntryForm,
  default as OfflineEntryFormDefault
} from './OfflineEntryForm';

export { 
  EntrySyncMetrics,
  default as EntrySyncMetricsDefault
} from './EntrySyncMetrics';

// Re-export common types used across entry sync components
export type { SyncableShowEntry, EntryStatus } from '@/store/entryStore';
export type { SyncConflict, SyncEvent } from '@/types/sync-types';