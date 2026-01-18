import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useOptimisticForm } from '@/hooks/useOptimisticUI';
import { FormSaveIndicator } from '../optimistic/OptimisticUpdateIndicator';
import { logger } from '@/services/LoggingService';

interface OptimisticFormProps<T> {
  entityType: string;
  entityId: string;
  initialData: T;
  onSave: (data: T) => Promise<unknown>;
  onValidate?: (data: T) => string[] | null;
  children: (props: {
    data: T;
    updateField: (field: keyof T, value: T[keyof T]) => void;
    updateFields: (updates: Partial<T>) => void;
    isDirty: boolean;
    isProcessing: boolean;
    errors: string[];
  }) => React.ReactNode;
  autoSave?: boolean;
  autoSaveDelay?: number;
  showSaveIndicator?: boolean;
  className?: string;
}

export function OptimisticForm<T>({
  entityType,
  entityId,
  initialData,
  onSave,
  onValidate,
  children,
  autoSave = false,
  autoSaveDelay = 2000,
  showSaveIndicator = true,
  className
}: OptimisticFormProps<T>) {
  const [errors, setErrors] = useState<string[]>([]);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);

  const {
    formData,
    isDirty,
    isProcessing,
    updateField,
    updateFields,
    save,
    reset,
    revert
  } = useOptimisticForm(entityType, entityId, initialData, onSave);

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave || !isDirty || isProcessing) return;

    const autoSaveTimer = setTimeout(async () => {
      // Validate before auto-save
      if (onValidate) {
        const validationErrors = onValidate(formData);
        if (validationErrors && validationErrors.length > 0) {
          setErrors(validationErrors);
          return;
        }
      }

      try {
        await save();
        setLastSaveTime(new Date());
        setErrors([]);
      } catch (error) {
        logger.error('Auto-save failed:', 'components', {}, error as Error);
      }
    }, autoSaveDelay);

    return () => { clearTimeout(autoSaveTimer); };
  }, [formData, isDirty, isProcessing, autoSave, autoSaveDelay, onValidate, save]);

  const handleSave = async () => {
    // Validate before save
    if (onValidate) {
      const validationErrors = onValidate(formData);
      if (validationErrors && validationErrors.length > 0) {
        setErrors(validationErrors);
        return;
      }
    }

    try {
      await save();
      setLastSaveTime(new Date());
      setErrors([]);
    } catch (error: unknown) {
      setErrors([(error as Error).message || 'Save failed']);
    }
  };

  const handleReset = () => {
    reset();
    setErrors([]);
  };

  const handleRevert = async () => {
    await revert();
    setErrors([]);
  };

  return (
    <div className={cn('relative', className)}>
      {showSaveIndicator && <FormSaveIndicator />}
      
      <Card className="p-6">
        {/* Form content */}
        {children({
          data: formData,
          updateField,
          updateFields,
          isDirty,
          isProcessing,
          errors
        })}

        {/* Error display */}
        <AnimatePresence>
          {errors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4"
            >
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form actions */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-4">
            {lastSaveTime && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Saved {lastSaveTime.toLocaleTimeString()}
              </div>
            )}
            
            {autoSave && isDirty && !isProcessing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Auto-saving...
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isDirty && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isProcessing}
              >
                Reset
              </Button>
            )}
            
            {isProcessing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevert}
                disabled={!isDirty}
              >
                Revert
              </Button>
            )}

            {!autoSave && (
              <Button
                onClick={handleSave}
                disabled={!isDirty || isProcessing}
                size="sm"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// Specialized form components
export const OptimisticDogForm: React.FC<{
  dogId: string;
  initialData: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<unknown>;
  children: (props: { data: Record<string, unknown>; updateField: (field: string, value: unknown) => void; updateFields: (updates: Partial<Record<string, unknown>>) => void; isDirty: boolean; isProcessing: boolean; errors: string[]; }) => React.ReactNode;
}> = ({ dogId, initialData, onSave, children }) => (
  <OptimisticForm
    entityType="dog"
    entityId={dogId}
    initialData={initialData}
    onSave={onSave}
    autoSave={true}
    autoSaveDelay={3000}
  >
    {children}
  </OptimisticForm>
);

export const OptimisticEntryForm: React.FC<{
  entryId: string;
  initialData: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<unknown>;
  onValidate?: (data: Record<string, unknown>) => string[] | null;
  children: (props: { data: Record<string, unknown>; updateField: (field: string, value: unknown) => void; updateFields: (updates: Partial<Record<string, unknown>>) => void; isDirty: boolean; isProcessing: boolean; errors: string[]; }) => React.ReactNode;
}> = ({ entryId, initialData, onSave, onValidate, children }) => (
  <OptimisticForm
    entityType="entry"
    entityId={entryId}
    initialData={initialData}
    onSave={onSave}
    {...(onValidate !== undefined && { onValidate })}
    autoSave={false} // Entries require explicit save
  >
    {children}
  </OptimisticForm>
);

export const OptimisticScoreForm: React.FC<{
  scoreId: string;
  initialData: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<unknown>;
  children: (props: { data: Record<string, unknown>; updateField: (field: string, value: unknown) => void; updateFields: (updates: Partial<Record<string, unknown>>) => void; isDirty: boolean; isProcessing: boolean; errors: string[]; }) => React.ReactNode;
}> = ({ scoreId, initialData, onSave, children }) => (
  <OptimisticForm
    entityType="score"
    entityId={scoreId}
    initialData={initialData}
    onSave={onSave}
    autoSave={true}
    autoSaveDelay={1000} // Quick save for scores
  >
    {children}
  </OptimisticForm>
);