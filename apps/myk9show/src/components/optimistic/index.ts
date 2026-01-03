// Main service
export { optimisticUI, OptimisticUIService } from '@/services/optimistic/OptimisticUIService';

// Provider and context
export { OptimisticProvider } from './OptimisticProvider';
export { 
  useOptimisticUIContext, 
  useOptimisticNotifications, 
  withOptimisticUI,
  useRollbackNotifications,
  useSuccessConfirmation,
  useUndoManager,
  useUndoShortcut
} from '@/utils/optimisticUtils';

// Core hooks
export { 
  useOptimisticUI,
  useOptimisticDogs,
  useOptimisticEntries,
  useOptimisticScores,
  useOptimisticShows,
  useOptimisticForm
} from '@/hooks/useOptimisticUI';

// UI Components
export { 
  OptimisticUpdateIndicator,
  SaveIndicator,
  BulkOperationIndicator,
  FormSaveIndicator
} from './OptimisticUpdateIndicator';

export { 
  SuccessConfirmation,
  EntrySavedConfirmation,
  ScoreSubmittedConfirmation,
  BulkActionConfirmation
} from './SuccessConfirmation';

export { 
  RollbackNotification,
  NetworkErrorNotification,
  ConflictNotification,
  ValidationErrorNotification
} from './RollbackNotification';

export { 
  ProgressOverlay,
  FormSubmissionOverlay,
  BulkOperationOverlay,
  FileUploadOverlay
} from './ProgressOverlay';

export { 
  UndoToast,
  EntryDeletedToast,
  ScoreUpdatedToast,
  StatusChangedToast,
  BulkActionToast
} from './UndoToast';

// Types
export * from '@/types/optimistic-types';