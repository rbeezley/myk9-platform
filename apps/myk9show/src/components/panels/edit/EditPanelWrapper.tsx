import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

export interface EditPanelWrapperProps<T = Record<string, unknown>> {
  // Panel configuration
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';

  // Data management
  initialData: T;
  onSave: (data: T) => Promise<void> | void;

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

  // For create forms where hasChanges tracking doesn't apply
  forceHasChanges?: boolean;

  // Callbacks
  onDataChange?: (data: T, hasChanges: boolean) => void;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
  onAutoSave?: (data: T) => Promise<void> | void;
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
  forceHasChanges = false,
  onDataChange,
  onValidationChange,
  onAutoSave,
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

  // Reset form when initialData changes (schema path)
  useEffect(() => {
    if (useSchemaPath) {
      form.reset(initialData);
    }
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

  // Handle save — schema path delegates to form.handleSubmit
  const wrappedSave = useCallback(
    async (validatedData: T) => {
      try {
        setIsLoading(true);
        await onSave(validatedData);
        onClose();
      } catch (error) {
        logger.error('Save failed:', 'components', {}, error as Error);
        notifications.error('Failed to save changes', {
          description: getErrorMessage(error),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [onSave, onClose]
  );

  const handleSave = useMemo(() => {
    if (useSchemaPath) {
      return form.handleSubmit(wrappedSave);
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
        await onSave(legacyData);
        setLegacyHasChanges(false);
        onClose();
      } catch (error) {
        logger.error('Save failed:', 'components', {}, error as Error);
        notifications.error('Failed to save changes', {
          description: getErrorMessage(error),
        });
      } finally {
        setIsLoading(false);
      }
    };
  }, [useSchemaPath, form, wrappedSave, legacyIsValid, onSave, legacyData, onClose]);

  // Handle close with unsaved changes warning
  const handleClose = () => {
    if ((hasChanges || forceHasChanges) && showUnsavedWarning) {
      const shouldClose = window.confirm(
        'You have unsaved changes. Are you sure you want to close?'
      );
      if (!shouldClose) return;
    }
    onClose();
  };

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
  };

  // Footer content
  const footer = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-4">
        {/* Status indicators */}
        {hasChanges && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in-0 slide-in-from-left-1 duration-200 ease-out">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Unsaved changes</span>
          </div>
        )}

        {enableAutoSave && <div className="text-xs text-muted-foreground">Auto-save enabled</div>}

        {errorCount > 0 && (
          <div className="flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="h-3 w-3" />
            <span>
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {footerActions}
        <Button
          variant="outline"
          onClick={handleClose}
          disabled={isLoading}
          className="gap-2 transition-all duration-200 hover:scale-105 active:scale-95"
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
          className="gap-2 transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <Save className="h-4 w-4" />
          {isLoading ? 'Saving...' : saveLabel}
        </Button>
      </div>
    </div>
  );

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
        preventClose={(hasChanges || forceHasChanges) && showUnsavedWarning}
      >
        <div className="flex flex-col h-full animate-in fade-in-0 duration-300 ease-out">
          {/* Error display — legacy path only (schema path uses inline FormField errors) */}
          {!useSchemaPath && errors.length > 0 && (
            <div className="flex-shrink-0 mx-6 mt-4 mb-2 animate-in slide-in-from-top-2 duration-200 ease-out">
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 backdrop-blur-sm transition-all duration-200 hover:bg-destructive/15">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium text-destructive mb-1">
                      Please fix the following errors:
                    </h4>
                    <ul className="text-xs text-destructive/80 space-y-1">
                      {errors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main content - no overflow here, SlideOverPanel handles scrolling */}
          <div className="flex-1 animate-in slide-in-from-bottom-1 duration-400 ease-out">
            {children}
          </div>
        </div>
      </SlideOverPanel>
    </EditPanelContext.Provider>
  );
}

export default EditPanelWrapper;
