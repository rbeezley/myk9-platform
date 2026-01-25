import { useState, useCallback } from 'react';
import { z } from 'zod';
import { validateForm, validateField } from '@/lib/validation';

export interface UseValidatedFormOptions<T> {
  schema: z.ZodSchema<T>;
  initialData?: Partial<T>;
  onSubmit: (data: T) => Promise<void> | void;
  /**
   * @deprecated Use validateOnSubmitOnly instead for cleaner UX
   */
  validateOnChange?: boolean;
  /**
   * @deprecated Use validateOnSubmitOnly instead for cleaner UX
   */
  validateOnBlur?: boolean;
  /**
   * When true, validation errors are only shown after the first submit attempt.
   * This provides a cleaner UX - users don't see errors while filling out the form.
   * @default true
   */
  validateOnSubmitOnly?: boolean;
}

export function useValidatedForm<T>({
  schema,
  initialData = {},
  onSubmit,
  validateOnChange = false,
  validateOnBlur = false,
  validateOnSubmitOnly = true,
}: UseValidatedFormOptions<T>) {
  const [data, setData] = useState<Partial<T>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Track if form has been submitted at least once
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Determine if we should show errors based on mode
  const shouldShowErrors = validateOnSubmitOnly ? hasSubmitted : true;

  // Update a single field
  const updateField = useCallback((field: keyof T, value: T[keyof T]) => {
    setData(prev => ({ ...prev, [field]: value }));

    // Real-time validation on change (only if not in submit-only mode)
    if (!validateOnSubmitOnly && validateOnChange && touched[field as string]) {
      const fieldError = validateField(schema, field as string, value);
      setErrors(prev => ({
        ...prev,
        [field]: fieldError || '',
      }));
    }

    // If we've already submitted, re-validate this field to clear errors as user fixes them
    if (hasSubmitted) {
      const fieldError = validateField(schema, field as string, value);
      setErrors(prev => ({
        ...prev,
        [field]: fieldError || '',
      }));
    }
  }, [schema, validateOnChange, validateOnSubmitOnly, touched, hasSubmitted]);

  // Handle field blur
  const handleBlur = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));

    // Validation on blur (only if not in submit-only mode)
    if (!validateOnSubmitOnly && validateOnBlur) {
      const fieldError = validateField(schema, field as string, data[field]);
      setErrors(prev => ({
        ...prev,
        [field]: fieldError || '',
      }));
    }
  }, [schema, validateOnBlur, validateOnSubmitOnly, data]);

  // Handle form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Mark that we've attempted to submit
    setHasSubmitted(true);

    // Validate entire form
    const validation = validateForm(schema, data);

    if (!validation.success) {
      setErrors(validation.errors);
      // Mark all fields as touched to show errors
      const allTouched = Object.keys(validation.errors).reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {} as Record<string, boolean>);
      setTouched(prev => ({ ...prev, ...allTouched }));
      return false; // Return false to indicate validation failed
    }

    try {
      setIsSubmitting(true);
      setErrors({});
      await onSubmit(validation.data!);
      return true; // Return true to indicate success
    } catch (error) {
      // Handle submission errors
      if (error instanceof Error) {
        setErrors({ general: error.message });
      } else {
        setErrors({ general: 'An unexpected error occurred' });
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [schema, data, onSubmit]);

  // Reset form
  const reset = useCallback(() => {
    setData(initialData);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
    setHasSubmitted(false);
  }, [initialData]);

  // Clear errors
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  // Get field props for easy integration with form inputs
  // Only returns error if we should show errors (after submit in submit-only mode)
  const getFieldProps = useCallback((field: keyof T) => ({
    value: data[field] || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      updateField(field, e.target.value as T[keyof T]);
    },
    onBlur: () => handleBlur(field),
    error: shouldShowErrors && errors[field as string] ? errors[field as string] : undefined,
    'aria-invalid': shouldShowErrors && !!errors[field as string],
    'aria-describedby': shouldShowErrors && errors[field as string] ? `${field as string}-error` : undefined,
  }), [data, updateField, handleBlur, errors, shouldShowErrors]);

  // Get error for a specific field (respects shouldShowErrors)
  const getFieldError = useCallback((field: keyof T) => {
    return shouldShowErrors ? errors[field as string] : undefined;
  }, [errors, shouldShowErrors]);

  // Get all visible errors (for error summary)
  const visibleErrors = shouldShowErrors ? errors : {};

  // Check if form is valid (based on current errors, not visibility)
  const isValid = Object.values(errors).filter(Boolean).length === 0;

  // Check if form has been modified
  const isDirty = JSON.stringify(data) !== JSON.stringify(initialData);

  return {
    data,
    errors,
    visibleErrors, // Use this for FormErrorSummary
    touched,
    isSubmitting,
    isValid,
    isDirty,
    hasSubmitted,
    shouldShowErrors,
    updateField,
    handleBlur,
    handleSubmit,
    reset,
    clearErrors,
    getFieldProps,
    getFieldError, // Use this to get error for a specific field
  };
}