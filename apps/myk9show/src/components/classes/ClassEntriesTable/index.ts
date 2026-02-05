/**
 * ClassEntriesTable Module
 *
 * Exports the main component and related types/utilities for managing
 * class entries with inline editing support.
 */

// Main component
export { default as ClassEntriesTable } from './ClassEntriesTable';

// Types
export type {
  ClassEntriesTableProps,
  InlineEditData,
  InlineEditEntry,
  ErrorState,
  ChangesSummary
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
  formatTimeComponents
} from './utils';

// Hooks
export { useInlineEditing } from './hooks/useInlineEditing';

// Sub-components (for advanced use cases)
export { EmptyState } from './components/EmptyState';
export { ErrorDisplay } from './components/ErrorDisplay';
export { EntriesTableHeader } from './components/EntriesTableHeader';
export { InlineEditingToolbar } from './components/InlineEditingToolbar';
export { StatusCell, TimeCell, ScoreCell, PlacementCell } from './components/EditableCells';
export { SaveBar } from './components/SaveBar';
export { SummaryFooter } from './components/SummaryFooter';
export { DeleteDialog } from './components/DeleteDialog';
export { EntryActionsMenu } from './components/EntryActionsMenu';
