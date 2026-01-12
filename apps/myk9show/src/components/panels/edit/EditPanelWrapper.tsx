import React, { useState, useEffect, useCallback } from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Save, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditPanelContext, EditPanelContextValue } from './useEditPanel';
import { logger } from '@/services/LoggingService';

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
  validateData?: (data: T) => string[] | null; // Returns error messages or null
  
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
  
  // Callbacks
  onDataChange?: (data: T, hasChanges: boolean) => void;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
  onAutoSave?: (data: T) => Promise<void> | void;
}

export function EditPanelWrapper<T extends Record<string, unknown> = Record<string, unknown>>({
  open,
  onClose,
  title,
  subtitle,
  size = 'lg',
  initialData,
  onSave,
  children,
  validateData,
  enableAutoSave = false,
  autoSaveInterval = 30000, // 30 seconds
  showUnsavedWarning = true,
  saveLabel = 'Save Changes',
  cancelLabel = 'Cancel',
  footerActions,
  headerActions,
  className,
  onDataChange,
  onValidationChange,
  onAutoSave,
}: EditPanelWrapperProps<T>) {
  
  // Internal state
  const [data, setData] = useState<T>(initialData);
  const [hasChanges, setHasChanges] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [, setLastAutoSave] = useState<number>(Date.now());

  // Update data when initialData changes
  useEffect(() => {
    setData(initialData);
    setHasChanges(false);
    setLastAutoSave(Date.now());
  }, [initialData]);

  // Track changes
  useEffect(() => {
    const hasChangesNow = JSON.stringify(data) !== JSON.stringify(initialData);
    setHasChanges(hasChangesNow);
    
    // Validate data
    let validationErrors: string[] = [];
    let isValidNow = true;
    
    if (validateData) {
      const result = validateData(data);
      if (result && result.length > 0) {
        validationErrors = result;
        isValidNow = false;
      }
    }
    
    setErrors(validationErrors);
    setIsValid(isValidNow);
    
    // Notify parent components
    onDataChange?.(data, hasChangesNow);
    onValidationChange?.(isValidNow, validationErrors);
  }, [data, initialData, validateData, onDataChange, onValidationChange]);

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

  // Update data function
  const updateData = useCallback((updates: Partial<T>) => {
    setData(prev => ({ ...prev, ...updates }));
  }, []);

  // Set complete data function
  const setCompleteData = useCallback((newData: T) => {
    setData(newData);
  }, []);

  // Handle save
  const handleSave = async () => {
    if (!isValid) {
      logger.warn('Cannot save: validation errors exist', 'components', {});
      return;
    }

    try {
      setIsLoading(true);
      await onSave(data);
      setHasChanges(false);
      onClose();
    } catch (error) {
      logger.error('Save failed:', 'components', {}, error as Error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  // Handle close with unsaved changes warning
  const handleClose = () => {
    if (hasChanges && showUnsavedWarning) {
      const shouldClose = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!shouldClose) return;
    }
    onClose();
  };

  // Context value
  const contextValue: EditPanelContextValue<Record<string, unknown>> = {
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
        
        {enableAutoSave && (
          <div className="text-xs text-muted-foreground">
            Auto-save enabled
          </div>
        )}
        
        {errors.length > 0 && (
          <div className="flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="h-3 w-3" />
            <span>{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
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
          disabled={!hasChanges || !isValid || isLoading}
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
        subtitle={subtitle}
        size={size}
        loading={isLoading}
        footer={footer}
        headerActions={headerActions}
        className={cn('edit-panel-wrapper', className)}
        preventClose={hasChanges && showUnsavedWarning}
      >
        <div className="flex flex-col h-full animate-in fade-in-0 duration-300 ease-out">
          {/* Error display */}
          {errors.length > 0 && (
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
          
          {/* Main content */}
          <div className="flex-1 overflow-auto animate-in slide-in-from-bottom-1 duration-400 ease-out">
            {children}
          </div>
        </div>
      </SlideOverPanel>
    </EditPanelContext.Provider>
  );
}

export default EditPanelWrapper;