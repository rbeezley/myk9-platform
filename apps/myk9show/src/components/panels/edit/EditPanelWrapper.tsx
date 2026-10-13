import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { z } from 'zod';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { cn } from '@/lib/utils';
import { EditPanelContext, EditPanelContextValue } from './useEditPanel';
import { logger } from '@/services/LoggingService';
import { useFormValidation, FormValidation } from '@/hooks/useFormValidation';
import { useRegisterActionBar } from '@/hooks/useRegisterActionBar';
import { UnsavedChangesRouteGuard } from '@/components/navigation/UnsavedChangesRouteGuard';
import { DiscardChangesDialog, useStillSavingPrompt } from './DiscardChangesDialog';
import { announcePanelSaved, reportPanelSaveFailure } from './editPanelSaveFeedback';
import { EditPanelDeleteDialog } from './EditPanelDelete';
import type { DeleteRecordsResult } from '@/features/delete';
import { EditPanelFooter } from './EditPanelFooter';
import { EditPanelInlineShell } from './EditPanelShells';
import { RequiredLegend } from '@/components/common/RequiredMark';
import { useEditPanelSteps } from './useEditPanelSteps';
import { useSelfNavigation } from './useSelfNavigation';
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
  closeRequestRef,
  onExited,
  forceHasChanges = false,
  successMessage,
  onDataChange,
  onValidationChange,
  onAutoSave,
  onValidationFail,
  steps,
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

  const { selfNavigationRef, runSelfNavigation } = useSelfNavigation();
  const closeWithoutRouteGuard = useCallback(
    () => runSelfNavigation(onClose),
    [onClose, runSelfNavigation]
  );

  const confirmSaved = useCallback(
    (saved: T) => announcePanelSaved(successMessage, saved),
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
        reportPanelSaveFailure(error);
      } finally {
        setIsLoading(false);
      }
    },
    [onSave, closeWithoutRouteGuard, runSelfNavigation, confirmSaved]
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
        reportPanelSaveFailure(error);
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
  ]);

  const actionBarRef = useRegisterActionBar<HTMLDivElement>();

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const { open: stillSavingOpen, ask: askStillSaving, dialog } = useStillSavingPrompt(isLoading);
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
    // The delete dialog is answering for this panel: leaving now would orphan it.
    if (deleteOpen) return;
    // Defensive: Escape reaches the host's key handler AND the open prompt, and
    // the prompt answers it ("Keep editing"), so a host copy must not re-raise
    // it. Today the prompt's own dismissal already wins (the test passes with
    // this line removed); it keeps that true if the handlers ever reorder.
    if (showUnsavedDialog || stillSavingOpen) return;
    // A save in flight may still fail, and closing now would drop the form it
    // fails back to. Hold still, but say why (MYK9-1125).
    if (isLoading) return askStillSaving();
    if (hasChanges && showUnsavedWarning) {
      setShowUnsavedDialog(true);
      return;
    }
    closeWithoutRouteGuard();
  }, [
    hasChanges,
    showUnsavedWarning,
    showUnsavedDialog,
    stillSavingOpen,
    askStillSaving,
    closeWithoutRouteGuard,
    isLoading,
    deleteOpen,
  ]);

  // An inline host owns Back / Escape / X and routes them here, so the discard
  // prompt and the save-in-flight hold apply exactly as they do to Cancel.
  useEffect(() => {
    if (!closeRequestRef) return;
    closeRequestRef.current = handleClose;
    return () => {
      closeRequestRef.current = null;
    };
  }, [closeRequestRef, handleClose]);

  const routeLeaveGuard = (
    <UnsavedChangesRouteGuard
      isDirty={open && hasChanges && showUnsavedWarning}
      subject={title}
      selfNavigationRef={selfNavigationRef}
    />
  );

  // Create-mode tab walk: Next replaces Save until the last tab (decision 13).
  const stepsState = useEditPanelSteps({
    steps,
    schema,
    data,
    touchField: field => form.touchField(field),
    open,
  });

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
    requestTab: stepsState.requestTab,
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

  // Footer content. The inline shell registers this footer; SlideOverPanel
  // registers its generic footer container so every slide-out consumer gets
  // the same toast clearance without each caller remembering the hook.
  const footer = (
    <EditPanelFooter
      errors={errors}
      onDelete={onDelete}
      onOpenDelete={() => setDeleteOpen(true)}
      controlsBlocked={controlsBlocked}
      cancelDisabled={deleteOpen}
      hasChanges={hasChanges}
      enableAutoSave={enableAutoSave}
      footerActions={footerActions}
      cancelLabel={cancelLabel}
      onCancel={handleClose}
      saveVariant={saveVariant}
      saveLabel={saveLabel}
      saveDisabled={
        useSchemaPath
          ? (!hasChanges && !forceHasChanges) || controlsBlocked
          : (!hasChanges && !forceHasChanges) || !isValid || controlsBlocked
      }
      saving={isLoading}
      onSave={handleSave}
      nextTab={stepsState.nextTab}
      onNext={stepsState.goNext}
      stepBlockedMessage={stepsState.blockedMessage}
    />
  );

  // Create forms carry required markers; say once what the asterisk means.
  const body = (
    <>
      {steps?.mode === 'create' && (
        <RequiredLegend className="px-6 pt-4 text-xs text-muted-foreground" />
      )}
      {children}
    </>
  );

  const deleteDialog = onDelete && (
    <EditPanelDeleteDialog
      option={onDelete}
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      onDeleted={handleDeleted}
    />
  );

  // The prompts that answer for this panel, rendered beside it in every variant.
  const overlays = (
    <>
      <DiscardChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        // Inline: Discard unmounts this form and the prompt with it, and the
        // dialog's default return-focus then falls back to some EARLIER popup's
        // trigger behind the host's modal. The host places focus itself.
        {...(variant === 'inline' && { finalFocus: () => !confirmedCloseRef.current })}
        onDiscard={() => {
          confirmedCloseRef.current = true;
          setShowUnsavedDialog(false);
          closeWithoutRouteGuard();
        }}
      />
      {dialog}
      {routeLeaveGuard}
    </>
  );

  const shell =
    variant === 'inline' ? (
      <EditPanelInlineShell body={body} footer={footer} actionBarRef={actionBarRef} />
    ) : (
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
        // Escape, the backdrop and the X reach handleClose, which asks before a
        // dirty form closes; only an open delete confirm blocks them (MYK9-910).
        preventClose={deleteOpen}
        {...(onExited && { onExited })}
      >
        <div className="flex flex-col h-full animate-in fade-in-0 duration-300 ease-out">
          {/* Main content - no overflow here, SlideOverPanel handles scrolling */}
          <div className="flex-1 animate-in slide-in-from-bottom-1 duration-400 ease-out">
            {body}
          </div>
        </div>
      </SlideOverPanel>
    );

  return (
    <EditPanelContext.Provider value={contextValue}>
      {shell}
      {overlays}
      {deleteDialog}
    </EditPanelContext.Provider>
  );
}

export default EditPanelWrapper;
