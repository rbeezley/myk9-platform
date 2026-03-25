export { default as ClassEntriesTable } from './ClassEntriesTable';
export type { DisplayRow } from './ClassEntriesTable';

// Types
export type {
  ClassEntriesTableProps,
  InlineEditData,
  InlineEditEntry,
  ErrorState,
  ChangesSummary,
} from './types';

export { DEFAULT_PERMISSIONS } from './types';

// Utilities
export {
  getStatusColor,
  getPlacementStyle,
  calculateChangesSummary,
  generateCSVContent,
  downloadEntriesAsCSV,
  parseTimeString,
  formatTimeComponents,
} from './utils';

// Hooks
export { useInlineEditing } from './hooks/useInlineEditing';

// Sub-components (for advanced use cases)
export { DeleteDialog } from './components/DeleteDialog';
export { EntryActionsMenu } from './components/EntryActionsMenu';
export { EditableField } from './components/InlineEditCells';
