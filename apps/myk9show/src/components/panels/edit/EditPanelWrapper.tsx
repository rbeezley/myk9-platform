import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { z } from 'zod';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditPanelContext, EditPanelContextValue } from './useEditPanel';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { useFormValidation, FormValidation } from '@/hooks/useFormValidation';
import { useRegisterActionBar } from '@/hooks/useRegisterActionBar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UnsavedChangesRouteGuard } from '@/components/navigation/UnsavedChangesRouteGuard';
import { DiscardChangesDialog } from './DiscardChangesDialog';
import { PanelSaveHandledError, offlineAwareMessage } from './panelSaveErrors';
import { friendlySaveError } from '@/utils/friendlySaveError';
import { EditPanelDeleteButton, EditPanelDeleteDialog } from './EditPanelDelete';
import type { DeleteRecordsResult } from '@/features/delete';
import { EditPanelErrorSummary } from './EditPanelErrorSummary';
import type { EditPanelWrapperProps } from './EditPanelWrapper.types';

export type { EditPanelDeleteOption } from './EditPanelDelete';

export type {
  EditPanelSaveContext,
  EditPanelVariant,
  EditPanelWrapperProps,
} from './EditPanelWrapper.types';

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
  saveVariant = 'default',
  cancelLabel = 'Cancel',
  footerActions,
  headerActions,
  className,
  onDelete,
  variant = 'panel',
  forceHasChanges = false,
  successMessage,
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
  // Edits outlive a changed baseline. A failed save can change `initialData`
  // underneath the form (a caller's optimistic update, then its rollback), and
  // resetting then would wipe what the user typed while the toast says "Your
  // changes are still here". So initial data re-seeds the form only when the
  // panel (re)opens or the form holds no edits of its own.
  const wasOpenRef = useRef(open);
  const lastInitialDataJsonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!useSchemaPath) return;
    const reopened = open && !wasOpenRef.current;
    const nextJson = JSON.stringify(initialData);
    if (nextJson === lastInitialDataJsonRef.current && !reopened) return;
    if (open && !reopened && form.hasChanges) return;
    lastInitialDataJsonRef.current = nextJson;
    form.reset(initialData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, useSchemaPath, open]);

  // --- Legacy path: useState owns state ---
  const [legacyData, setLegacyData] = useState<T>(initialData);
  const [legacyHasChanges, setLegacyHasChanges] = useState(false);
  const [legacyErrors, setLegacyErrors] = useState<string[]>([]);
  const [legacyIsValid, setLegacyIsValid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [, setLastAutoSave] = useState<number>(Date.now());
  const [isTouched, setIsTouched] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Update legacy data when initialData changes
  useEffect(() => {
    if (useSchemaPath) return;
    if (open && wasOpenRef.current && legacyHasChanges) return;
    setLegacyData(initialData);
    setLegacyHasChanges(false);
    setIsTouched(false);
    setLastAutoSave(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, useSchemaPath, open]);

  // Declared after both re-seed effects so they read the previous open state.
  useEffect(() => {
    wasOpenRef.current = open;
  }, [open]);

  // Unified accessors
  const data = useSchemaPath ? form.data : legacyData;
  const hasChanges = useSchemaPath ? form.hasChanges : legacyHasChanges;
  const isValid = useSchemaPath ? form.isValid : legacyIsValid;
  const errors = useSchemaPath ? Object.values(form.errors) : legacyErrors;

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

  // One report for both save paths. A failed save keeps the form open and says
  // so in friendly words; the raw error text goes to the log only (H1).
  const reportSaveFailure = useCallback((error: unknown) => {
    // A handled refusal is a UX path the panel already explained, not an error.
    if (error instanceof PanelSaveHandledError) return;
    logger.error('Save failed:', 'components', {}, error as Error);
    const { title, description } = friendlySaveError(error);
    notifications.error(title, { description });
  }, []);

  const confirmSaved = useCallback(
    (saved: T) => {
      if (successMessage === undefined) return;
      notifications.success(
        offlineAwareMessage(
          typeof successMessage === 'function' ? successMessage(saved) : successMessage
        )
      );
    },
    [successMessage]
  );

  // Handle save — schema path delegates to form.handleSubmit
  const wrappedSave = useCallback(
    async (validatedData: T) => {
      try {
        setIsLoading(true);
        await onSave(validatedData, { runSelfNavigation });
        confirmSaved(validatedData);
        closeWithoutRouteGuard();
      } catch (error) {
        reportSaveFailure(error);
      } finally {
        setIsLoading(false);
      }
    },
    [onSave, closeWithoutRouteGuard, runSelfNavigation, confirmSaved, reportSaveFailure]
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
        confirmSaved(legacyData);
        closeWithoutRouteGuard();
      } catch (error) {
        reportSaveFailure(error);
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
    confirmSaved,
    reportSaveFailure,
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
      setDeleteOpen(false);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (confirmedCloseRef.current) return;
    // A save in flight may still fail, and closing now would drop the form it
    // fails back to.
    if (isLoading) return;
    // The delete dialog is answering for this panel: leaving now would orphan it.
    if (deleteOpen) return;
    if (hasChanges && showUnsavedWarning) {
      setShowUnsavedDialog(true);
      return;
    }
    closeWithoutRouteGuard();
  }, [hasChanges, showUnsavedWarning, closeWithoutRouteGuard, isLoading, deleteOpen]);

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

  // Save and Close hold still while the delete dialog is open: its server call
  // may be in flight, and a save racing a delete would write to a gone row.
  const controlsBlocked = isLoading || deleteOpen;

  // The item is gone, so its unsaved edits are moot: close without the discard
  // prompt or the route guard, then let the caller navigate away.
  const handleDeleted = (result: DeleteRecordsResult) => {
    confirmedCloseRef.current = true;
    setDeleteOpen(false);
    runSelfNavigation(() => {
      onClose();
      onDelete?.onDeleted?.(result);
    });
  };

  // Footer content. Dialogs register this whole footer below; SlideOverPanel
  // registers its generic footer container so every slide-out consumer gets
  // the same toast clearance without each caller remembering the hook.
  const footer = (
    <div className="flex w-full flex-col gap-3">
      <EditPanelErrorSummary errors={errors} />

      <div
        data-testid="edit-panel-action-row"
        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2"
      >
        {onDelete && (
          <EditPanelDeleteButton
            option={onDelete}
            disabled={controlsBlocked}
            onOpen={() => setDeleteOpen(true)}
            className="order-last sm:order-none"
          />
        )}
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
            disabled={controlsBlocked}
            className="min-w-0 flex-1 gap-2 transition-all duration-200 hover:scale-105 active:scale-95 sm:flex-none"
          >
            <X className="h-4 w-4" />
            {cancelLabel}
          </Button>
          <Button
            variant={saveVariant}
            data-variant={saveVariant}
            onClick={handleSave}
            disabled={
              useSchemaPath
                ? (!hasChanges && !forceHasChanges) || controlsBlocked
                : (!hasChanges && !forceHasChanges) || !isValid || controlsBlocked
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

  // In the dialog variant it is mounted INSIDE the dialog so Base UI treats it as
  // a nested dialog: a sibling would sit under the outer dialog's inert layer.
  const deleteDialog = onDelete && (
    <EditPanelDeleteDialog
      option={onDelete}
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      onDeleted={handleDeleted}
    />
  );

  // The prompts that answer for this panel, rendered beside it in both variants.
  const overlays = (
    <>
      <DiscardChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onDiscard={() => {
          confirmedCloseRef.current = true;
          setShowUnsavedDialog(false);
          closeWithoutRouteGuard();
        }}
      />
      {routeLeaveGuard}
    </>
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
            {deleteDialog}
          </DialogContent>
        </Dialog>

        {overlays}
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
        preventClose={(hasChanges && showUnsavedWarning) || deleteOpen}
      >
        <div className="flex flex-col h-full animate-in fade-in-0 duration-300 ease-out">
          {/* Main content - no overflow here, SlideOverPanel handles scrolling */}
          <div className="flex-1 animate-in slide-in-from-bottom-1 duration-400 ease-out">
            {children}
          </div>
        </div>
      </SlideOverPanel>

      {overlays}
      {deleteDialog}
    </EditPanelContext.Provider>
  );
}

export default EditPanelWrapper;
