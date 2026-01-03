import { useState, useCallback } from 'react';
import { z } from 'zod';
import { validateForm, validateField } from '@/lib/validation';

export interface UseValidatedFormOptions<T> {
  schema: z.ZodSchema<T>;
  initialData?: Partial<T>;
  onSubmit: (data: T) => Promise<void> | void;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

export function useValidatedForm<T>({
  schema,
  initialData = {},
  onSubmit,
  validateOnChange = true,
  validateOnBlur = true,
}: UseValidatedFormOptions<T>) {
  const [data, setData] = useState<Partial<T>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update a single field
  const updateField = useCallback((field: keyof T, value: T[keyof T]) => {
    setData(prev => ({ ...prev, [field]: value }));

    // Real-time validation on change
    if (validateOnChange && touched[field as string]) {
      const fieldError = validateField(schema, field as string, value);
      setErrors(prev => ({
        ...prev,
        [field]: fieldError || '',
      }));
    }
  }, [schema, validateOnChange, touched]);

  // Handle field blur
  const handleBlur = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));

    // Validation on blur
    if (validateOnBlur) {
      const fieldError = validateField(schema, field as string, data[field]);
      setErrors(prev => ({
        ...prev,
        [field]: fieldError || '',
      }));
    }
  }, [schema, validateOnBlur, data]);

  // Handle form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    
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
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors({});
      await onSubmit(validation.data!);
    } catch (error) {
      // Handle submission errors
      if (error instanceof Error) {
        setErrors({ general: error.message });
      } else {
        setErrors({ general: 'An unexpected error occurred' });
      }
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
  }, [initialData]);

  // Clear errors
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  // Get field props for easy integration with form inputs
  const getFieldProps = useCallback((field: keyof T) => ({
    value: data[field] || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      updateField(field, e.target.value as T[keyof T]);
    },
    onBlur: () => handleBlur(field),
    error: touched[field as string] ? errors[field as string] : undefined,
    'aria-invalid': !!errors[field as string],
    'aria-describedby': errors[field as string] ? `${field as string}-error` : undefined,
  }), [data, updateField, handleBlur, errors, touched]);

  // Check if form is valid
  const isValid = Object.keys(errors).length === 0 && Object.keys(touched).length > 0;

  // Check if form has been modified
  const isDirty = JSON.stringify(data) !== JSON.stringify(initialData);

  return {
    data,
    errors,
    touched,
    isSubmitting,
    isValid,
    isDirty,
    updateField,
    handleBlur,
    handleSubmit,
    reset,
    clearErrors,
    getFieldProps,
  };
}