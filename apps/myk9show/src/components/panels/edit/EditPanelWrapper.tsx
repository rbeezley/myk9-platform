import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { z } from 'zod';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Save, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditPanelContext, EditPanelContextValue } from './useEditPanel';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import { useFormValidation, FormValidation } from '@/hooks/useFormValidation';
import { useRegisterActionBar } from '@/hooks/useRegisterActionBar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UnsavedChangesRouteGuard } from '@/components/navigation/UnsavedChangesRouteGuard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  cancelLabel?: string;
  footerActions?: React.ReactNode;
  headerActions?: React.ReactNode;
  className?: string;

  variant?: EditPanelVariant;

  // For create forms where hasChanges tracking doesn't apply
  forceHasChanges?: boolean;

  // Callbacks
  onDataChange?: (data: T, hasChanges: boolean) => void;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
  onAutoSave?: (data: T) => Promise<void> | void;
  onValidationFail?: (firstErrorField: string) => void;
}

function UnsavedChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. They will be lost if you close without saving.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onDiscard}
          >
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Dummy schema used when no schema is provided (satisfies rules of hooks).
// IMPORTANT: Do not read form.isValid/form.errors on the legacy path — the dummy
// schema always validates as valid, which would be misleading. Use legacyIsValid instead.
const DUMMY_SCHEMA = z.object({}) as z.ZodSchema<Record<string, unknown>>;

export function EditPanelWrapper<T extends Record<string, unknown> = Record<string, unknown>>({
  open,
  onClose,
  title,
  subtitle,
  size = 'lg',
  initialData,
  onSave,
  children,
  schema,
  validateData,
  enableAutoSave = false,
  autoSaveInterval = 30000, // 30 seconds
  showUnsavedWarning = true,
  saveLabel = 'Save Changes',
  cancelLabel = 'Cancel',
  footerActions,
  headerActions,
  className,
  variant = 'panel',
  forceHasChanges = false,
  onDataChange,
  onValidationChange,
  onAutoSave,
  onValidationFail,
}: EditPanelWrapperProps<T>) {
  // Determine which path to use
  const useSchemaPath = !!schema;

  // Log deprecation warning for validateData
  useEffect(() => {
    if (validateData && !schema) {
      console.warn(
        'EditPanelWrapper: validateData is deprecated. Use schema prop with a Zod schema instead.'
      );
    }
  }, [validateData, schema]);

  // --- Schema path: useFormValidation owns state ---
  const form = useFormValidation((schema ?? DUMMY_SCHEMA) as z.ZodSchema<T>, initialData);

  // Reset form when initialData *value* changes (schema path). Consumers that
  // forget to memoize initialData would otherwise wipe in-progress user edits
  // on every parent re-render — deep-equality guards against that. Legacy path
  // skips the stringify cost entirely.
  const lastInitialDataJsonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!useSchemaPath) return;
    const nextJson = JSON.stringify(initialData);
    if (nextJson === lastInitialDataJsonRef.current) return;
    lastInitialDataJsonRef.current = nextJson;
    form.reset(initialData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, useSchemaPath]);

  // --- Legacy path: useState owns state ---
  const [legacyData, setLegacyData] = useState<T>(initialData);
  const [legacyHasChanges, setLegacyHasChanges] = useState(false);
  const [legacyErrors, setLegacyErrors] = useState<string[]>([]);
  const [legacyIsValid, setLegacyIsValid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [, setLastAutoSave] = useState<number>(Date.now());
  const [isTouched, setIsTouched] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);

  // Update legacy data when initialData changes
  useEffect(() => {
    if (!useSchemaPath) {
      setLegacyData(initialData);
      setLegacyHasChanges(false);
      setIsTouched(false);
      setLastAutoSave(Date.now());
    }
  }, [initialData, useSchemaPath]);

  // Unified accessors
  const data = useSchemaPath ? form.data : legacyData;
  const hasChanges = useSchemaPath ? form.hasChanges : legacyHasChanges;
  const isValid = useSchemaPath ? form.isValid : legacyIsValid;
  const errors = useSchemaPath ? Object.values(form.errors) : legacyErrors;
  const errorCount = useSchemaPath ? Object.keys(form.errors).length : legacyErrors.length;

  useEffect(() => {
    if (errorCount <= 2) setShowAllErrors(false);
  }, [errorCount]);

  // Legacy: Track changes and validate
  useEffect(() => {
    if (useSchemaPath) return;

    const hasChangesNow = JSON.stringify(legacyData) !== JSON.stringify(initialData);
    setLegacyHasChanges(hasChangesNow);

    let validationErrors: string[] = [];
    let isValidNow = true;

    if (validateData) {
      const result = validateData(legacyData);
      if (result && result.length > 0) {
        validationErrors = result;
        isValidNow = false;
      }
    }

    setLegacyErrors(isTouched ? validationErrors : []);
    setLegacyIsValid(isValidNow);

    onDataChange?.(legacyData, hasChangesNow);
    onValidationChange?.(isValidNow, isTouched ? validationErrors : []);
  }, [
    legacyData,
    initialData,
    validateData,
    onDataChange,
    onValidationChange,
    isTouched,
    useSchemaPath,
  ]);

  // Schema path: fire onValidationChange callback
  useEffect(() => {
    if (!useSchemaPath) return;
    onValidationChange?.(form.isValid, Object.values(form.errors));
  }, [form.isValid, form.errors, onValidationChange, useSchemaPath]);

  // Schema path: fire onDataChange callback
  useEffect(() => {
    if (!useSchemaPath) return;
    onDataChange?.(form.data, form.hasChanges);
  }, [form.data, form.hasChanges, onDataChange, useSchemaPath]);

  // Auto-save functionality
  useEffect(() => {
    if (!enableAutoSave || !hasChanges || !isValid || !onAutoSave) return;

    const autoSaveTimer = setTimeout(async () => {
      try {
        setIsLoading(true);
        await onAutoSave(data);
        setLastAutoSave(Date.now());
        logger.debug('Auto-saved successfully', 'components', {});
      } catch (error) {
        logger.error('Auto-save failed:', 'components', {}, error as Error);
      } finally {
        setIsLoading(false);
      }
    }, autoSaveInterval);

    return () => clearTimeout(autoSaveTimer);
  }, [data, hasChanges, isValid, enableAutoSave, autoSaveInterval, onAutoSave]);

  // Legacy: Update data function
  const updateData = useCallback(
    (updates: Partial<T>) => {
      if (useSchemaPath) {
        form.setValues(updates);
      } else {
        setIsTouched(true);
        setLegacyData(prev => ({ ...prev, ...updates }));
      }
    },
    [useSchemaPath, form]
  );

  // Legacy: Set complete data function
  const setCompleteData = useCallback(
    (newData: T) => {
      if (useSchemaPath) {
        form.reset(newData);
      } else {
        setLegacyData(newData);
      }
    },
    [useSchemaPath, form]
  );

  // While this counter is above zero the route guard stands down: the panel is
  // navigating on its own behalf, and the user already answered for those
  // changes in the panel's own dialog. Without it, closing a panel whose parent
  // drops a `?add=true` param produces a second "Leave this page?" prompt for
  // changes just discarded (MYK9-165).
  //
  // The counter is raised around the navigating CALL only — never across an
  // await — so a slow save leaves the form guarded the whole time it is in
  // flight. A ref rather than state because nothing can re-render between a
  // click handler and the navigation it dispatches in the same tick.
  const selfNavigationRef = useRef(0);
  const runSelfNavigation = useCallback((navigate: () => void) => {
    selfNavigationRef.current += 1;
    try {
      navigate();
    } finally {
      selfNavigationRef.current -= 1;
    }
  }, []);
  const closeWithoutRouteGuard = useCallback(
    () => runSelfNavigation(onClose),
    [onClose, runSelfNavigation]
  );

  // Handle save — schema path delegates to form.handleSubmit
  const wrappedSave = useCallback(
    async (validatedData: T) => {
      try {
        setIsLoading(true);
        await onSave(validatedData, { runSelfNavigation });
        closeWithoutRouteGuard();
      } catch (error) {
        logger.error('Save failed:', 'components', {}, error as Error);
        notifications.error('Failed to save changes', {
          description: getErrorMessage(error),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [onSave, closeWithoutRouteGuard, runSelfNavigation]
  );

  const handleSave = useMemo(() => {
    if (useSchemaPath) {
      return form.handleSubmit(wrappedSave, onValidationFail);
    }
    // Legacy save
    return async () => {
      setIsTouched(true);
      if (!legacyIsValid) {
        logger.warn('Cannot save: validation errors exist', 'components', {});
        return;
      }

      try {
        setIsLoading(true);
        await onSave(legacyData, { runSelfNavigation });
        setLegacyHasChanges(false);
        closeWithoutRouteGuard();
      } catch (error) {
        logger.error('Save failed:', 'components', {}, error as Error);
        notifications.error('Failed to save changes', {
          description: getErrorMessage(error),
        });
      } finally {
        setIsLoading(false);
      }
    };
  }, [
    useSchemaPath,
    form,
    wrappedSave,
    legacyIsValid,
    onSave,
    legacyData,
    closeWithoutRouteGuard,
    runSelfNavigation,
    onValidationFail,
  ]);

  const actionBarRef = useRegisterActionBar<HTMLDivElement>();

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  // Set to true when the user explicitly confirmed the close via AlertDialog,
  // so SlideOverPanel's own onClose callback doesn't re-trigger the dialog.
  const confirmedCloseRef = useRef(false);

  // Reset flags when the panel reopens.
  useEffect(() => {
    if (open) {
      confirmedCloseRef.current = false;
    } else {
      setShowUnsavedDialog(false);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (confirmedCloseRef.current) return;
    if (hasChanges && showUnsavedWarning) {
      setShowUnsavedDialog(true);
      return;
    }
    closeWithoutRouteGuard();
  }, [hasChanges, showUnsavedWarning, closeWithoutRouteGuard]);

  const routeLeaveGuard = (
    <UnsavedChangesRouteGuard
      isDirty={open && hasChanges && showUnsavedWarning}
      subject={title}
      selfNavigationRef={selfNavigationRef}
    />
  );

  // Context value
  const contextValue: EditPanelContextValue<Record<string, unknown>> = {
    form: useSchemaPath ? (form as unknown as FormValidation<Record<string, unknown>>) : undefined,
    data: data as Record<string, unknown>,
    updateData: updateData as (updates: Partial<Record<string, unknown>>) => void,
    setData: setCompleteData as (data: Record<string, unknown>) => void,
    hasChanges,
    isValid,
    errors,
    isLoading,
    setIsLoading,
    runSelfNavigation,
  };

  const visibleErrors = showAllErrors ? errors : errors.slice(0, 2);
  const hiddenErrorCount = Math.max(0, errorCount - visibleErrors.length);

  // Footer content. Dialogs register this whole footer below; SlideOverPanel
  // registers its generic footer container so every slide-out consumer gets
  // the same toast clearance without each caller remembering the hook.
  const footer = (
    <div className="flex w-full flex-col gap-3">
      {errorCount > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="w-full rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Please fix the following errors:</p>
              <ul className="mt-1 space-y-1">
                {visibleErrors.map((error, index) => (
                  <li key={`${error}-${index}`}>• {error}</li>
                ))}
              </ul>
              {errorCount > 2 && (
                <button
                  type="button"
                  className="mt-1 min-h-11 rounded-md font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={showAllErrors}
                  onClick={() => setShowAllErrors(current => !current)}
                >
                  {showAllErrors
                    ? 'Show fewer errors'
                    : `Show ${hiddenErrorCount} more ${hiddenErrorCount === 1 ? 'error' : 'errors'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        data-testid="edit-panel-action-row"
        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2"
      >
        <div
          data-testid="edit-panel-status-group"
          className="flex min-w-0 flex-1 items-center gap-4"
        >
          {/* Status indicators */}
          {hasChanges && (
            <div
              role="status"
              aria-label="Unsaved changes"
              className="flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in-0 slide-in-from-left-1 duration-200 ease-out"
            >
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
              <span className="hidden sm:inline" aria-hidden>
                Unsaved changes
              </span>
            </div>
          )}

          {enableAutoSave && <div className="text-xs text-muted-foreground">Auto-save enabled</div>}
        </div>

        <div
          data-testid="edit-panel-action-group"
          className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto"
        >
          {footerActions}
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="min-w-0 flex-1 gap-2 transition-all duration-200 hover:scale-105 active:scale-95 sm:flex-none"
          >
            <X className="h-4 w-4" />
            {cancelLabel}
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              useSchemaPath
                ? (!hasChanges && !forceHasChanges) || isLoading
                : (!hasChanges && !forceHasChanges) || !isValid || isLoading
            }
            className="min-w-0 flex-1 gap-2 transition-all duration-200 hover:scale-105 active:scale-95 sm:flex-none"
          >
            <Save className="h-4 w-4" />
            {isLoading ? 'Saving...' : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  if (variant === 'dialog') {
    return (
      <EditPanelContext.Provider value={contextValue}>
        <Dialog
          open={open}
          onOpenChange={(isOpen: boolean) => {
            if (!isOpen) handleClose();
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">{children}</div>
            <div ref={actionBarRef} className="border-t px-6 py-4 shrink-0">
              {footer}
            </div>
          </DialogContent>
        </Dialog>

        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onDiscard={() => {
            confirmedCloseRef.current = true;
            setShowUnsavedDialog(false);
            closeWithoutRouteGuard();
          }}
        />
        {routeLeaveGuard}
      </EditPanelContext.Provider>
    );
  }

  return (
    <EditPanelContext.Provider value={contextValue}>
      <SlideOverPanel
        open={open}
        onClose={handleClose}
        title={title}
        {...(subtitle !== undefined && { subtitle })}
        size={size}
        loading={isLoading}
        footer={footer}
        headerActions={headerActions}
        className={cn('edit-panel-wrapper', className)}
        preventClose={hasChanges && showUnsavedWarning}
      >
        <div className="flex flex-col h-full animate-in fade-in-0 duration-300 ease-out">
          {/* Main content - no overflow here, SlideOverPanel handles scrolling */}
          <div className="flex-1 animate-in slide-in-from-bottom-1 duration-400 ease-out">
            {children}
          </div>
        </div>
      </SlideOverPanel>

      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onDiscard={() => {
          confirmedCloseRef.current = true;
          setShowUnsavedDialog(false);
          closeWithoutRouteGuard();
        }}
      />
      {routeLeaveGuard}
    </EditPanelContext.Provider>
  );
}

export default EditPanelWrapper;
