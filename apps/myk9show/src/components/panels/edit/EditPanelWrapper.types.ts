import type React from 'react';
import type { z } from 'zod';
import type { EditPanelDeleteOption } from './EditPanelDelete';
import type { FieldLocation } from './usePanelValidationNavigation';

export type EditPanelVariant = 'panel' | 'dialog';

export interface EditPanelSaveContext {
  /**
   * Wrap any navigation the save itself performs (e.g. routing to the record
   * just created) so the unsaved-changes route guard stands down for exactly
   * that call. Suppressing for the whole save instead would leave the form
   * unguarded for the duration of a slow request — during which the user can
   * still navigate, and the save can still fail (MYK9-165).
   */
  runSelfNavigation: (navigate: () => void) => void;
}

/**
 * Tab walk for a tabbed panel (MYK9-931, owner decision 13). The panel owns the
 * active tab (via `usePanelValidationNavigation`) and hands it here so the footer
 * can walk it: in `create` mode every tab but the last shows "Next: <tab>" in
 * place of Save, blocked while the current tab misses a required field; the last
 * shows the save button ("Add <Object>"). `edit` mode shows Save on every tab.
 */
export interface EditPanelSteps {
  mode: 'create' | 'edit';
  tabs: ReadonlyArray<{ value: string; label: string }>;
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** The same field -> tab/element map the panel gives `usePanelValidationNavigation`. */
  locate: (field: string) => FieldLocation<string> | undefined;
}

export interface EditPanelWrapperProps<T = Record<string, unknown>> {
  // Panel configuration
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';

  // Data management
  initialData: T;
  onSave: (data: T, context: EditPanelSaveContext) => Promise<void> | void;

  // Form configuration
  children: React.ReactNode;
  schema?: z.ZodSchema<T>; // NEW: Zod schema for validation
  validateData?: (data: T) => string[] | null; // LEGACY: console warning when used

  // Advanced features
  enableAutoSave?: boolean;
  autoSaveInterval?: number; // milliseconds
  showUnsavedWarning?: boolean;

  // Customization
  saveLabel?: string;
  /** 'outline' demotes Save while another control (e.g. a Next step) is the primary action. */
  saveVariant?: 'default' | 'outline';
  cancelLabel?: string;
  footerActions?: React.ReactNode;
  headerActions?: React.ReactNode;
  className?: string;

  /**
   * "Delete ‹object›" at the far left of the footer (CRUD standard Phase 3).
   * Pass it only in edit mode and only for a viewer the server would let delete;
   * omitted, nothing renders. The wrapper owns the shared confirm dialog, blocks
   * its own Save and Close while that dialog is open, and closes itself once the
   * item is deleted.
   */
  onDelete?: EditPanelDeleteOption | undefined;

  variant?: EditPanelVariant;

  /** Tab walk: Next on every tab but the last in create mode. Needs `schema`. */
  steps?: EditPanelSteps;

  // For create forms where hasChanges tracking doesn't apply
  forceHasChanges?: boolean;

  /**
   * The confirmation toast shown once the save succeeds: "‹Name› saved" after
   * an edit, "‹Name› added" after a create (`savedMessage` / `addedMessage`).
   * Owned here so every save path confirms the same way and callers do not
   * fire their own. Omit only where the caller's toast carries a next-step
   * action the wrapper cannot express (Add Dog).
   */
  successMessage?: string | ((data: T) => string);

  // Callbacks
  onDataChange?: (data: T, hasChanges: boolean) => void;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
  onAutoSave?: (data: T) => Promise<void> | void;
  onValidationFail?: (firstErrorField: string) => void;
}
