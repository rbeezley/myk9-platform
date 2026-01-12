import { useState, useCallback, useMemo } from 'react';
import { logger } from '@/services/LoggingService';

export interface ValidationRule<T = unknown> {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: T) => string | null;
  message?: string;
}

export interface FieldConfig<T = unknown> {
  value: T;
  error?: string;
  touched?: boolean;
  dirty?: boolean;
  validationRules?: ValidationRule<T>;
}

export interface FormState<T extends Record<string, unknown>> {
  fields: { [K in keyof T]: FieldConfig<T[K]> };
  isValid: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  submitCount: number;
  errors: { [K in keyof T]?: string };
}

interface UseFormStateProps<T extends Record<string, unknown>> {
  initialValues: T;
  validationRules?: { [K in keyof T]?: ValidationRule<T[K]> };
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  onSubmit?: (values: T) => void | Promise<void>;
}

export function useFormState<T extends Record<string, unknown>>({
  initialValues,
  validationRules = {},
  validateOnChange = true,
  validateOnBlur = true,
  onSubmit,
}: UseFormStateProps<T>) {
  // Initialize form state
  const [formState, setFormState] = useState<FormState<T>>(() => {
    const fields = {} as FormState<T>['fields'];
    Object.keys(initialValues).forEach(key => {
      const fieldKey = key as keyof T;
      fields[fieldKey] = {
        value: initialValues[fieldKey],
        error: undefined,
        touched: false,
        dirty: false,
        validationRules: validationRules[fieldKey],
      };
    });

    return {
      fields,
      isValid: true,
      isDirty: false,
      isSubmitting: false,
      submitCount: 0,
      errors: {},
    };
  });

  // Validation function
  const validateField = useCallback((key: keyof T, value: T[keyof T]): string | null => {
    const rules = validationRules[key];
    if (!rules) return null;

    // Required validation
    if (rules.required && (value === null || value === undefined || value === '')) {
      return rules.message || `${String(key)} is required`;
    }

    // Skip other validations if field is empty and not required
    if (!rules.required && (value === null || value === undefined || value === '')) {
      return null;
    }

    // String validations
    if (typeof value === 'string') {
      if (rules.minLength !== undefined && value.length < rules.minLength) {
        return rules.message || `${String(key)} must be at least ${rules.minLength} characters`;
      }
      if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        return rules.message || `${String(key)} must be no more than ${rules.maxLength} characters`;
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        return rules.message || `${String(key)} format is invalid`;
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        return rules.message || `${String(key)} must be at least ${rules.min}`;
      }
      if (rules.max !== undefined && value > rules.max) {
        return rules.message || `${String(key)} must be no more than ${rules.max}`;
      }
    }

    // Custom validation
    if (rules.custom) {
      const customResult = rules.custom(value);
      if (customResult) {
        return customResult;
      }
    }

    return null;
  }, [validationRules]);

  // Validate all fields
  const validateAllFields = useCallback(() => {
    const newFields = { ...formState.fields };
    const newErrors: { [K in keyof T]?: string } = {};
    let isValid = true;

    Object.keys(newFields).forEach(key => {
      const fieldKey = key as keyof T;
      const field = newFields[fieldKey];
      const error = validateField(fieldKey, field.value);
      
      newFields[fieldKey] = { ...field, error: error || undefined };
      if (error) {
        newErrors[fieldKey] = error;
        isValid = false;
      }
    });

    return { newFields, newErrors, isValid };
  }, [formState.fields, validateField]);

  // Set field value
  const setFieldValue = useCallback((key: keyof T, value: T[keyof T]) => {
    setFormState(prev => {
      const field = prev.fields[key];
      const error = validateOnChange ? validateField(key, value) : field.error;
      
      const newFields = {
        ...prev.fields,
        [key]: {
          ...field,
          value,
          error: error || undefined,
          dirty: value !== initialValues[key],
        },
      };

      const isDirty = Object.values(newFields).some((f: FieldConfig<unknown>) => f.dirty);
      const hasErrors = Object.values(newFields).some((f: FieldConfig<unknown>) => f.error);

      return {
        ...prev,
        fields: newFields,
        isDirty,
        isValid: !hasErrors,
        errors: Object.fromEntries(
          Object.entries(newFields)
            .filter(([, f]: [string, FieldConfig<unknown>]) => f.error)
            .map(([k, f]: [string, FieldConfig<unknown>]) => [k, f.error])
        ) as { [K in keyof T]?: string },
      };
    });
  }, [validateOnChange, validateField, initialValues]);

  // Set field touched
  const setFieldTouched = useCallback((key: keyof T, touched = true) => {
    setFormState(prev => {
      const field = prev.fields[key];
      const error = validateOnBlur && touched ? validateField(key, field.value) : field.error;
      
      const newFields = {
        ...prev.fields,
        [key]: {
          ...field,
          touched,
          error: error || undefined,
        },
      };

      const hasErrors = Object.values(newFields).some((f: FieldConfig<unknown>) => f.error);

      return {
        ...prev,
        fields: newFields,
        isValid: !hasErrors,
        errors: Object.fromEntries(
          Object.entries(newFields)
            .filter(([, f]: [string, FieldConfig<unknown>]) => f.error)
            .map(([k, f]: [string, FieldConfig<unknown>]) => [k, f.error])
        ) as { [K in keyof T]?: string },
      };
    });
  }, [validateOnBlur, validateField]);

  // Set field error
  const setFieldError = useCallback((key: keyof T, error: string | null) => {
    setFormState(prev => {
      const newFields = {
        ...prev.fields,
        [key]: {
          ...prev.fields[key],
          error: error || undefined,
        },
      };

      const hasErrors = Object.values(newFields).some((f: FieldConfig<unknown>) => f.error);

      return {
        ...prev,
        fields: newFields,
        isValid: !hasErrors,
        errors: Object.fromEntries(
          Object.entries(newFields)
            .filter(([, f]: [string, FieldConfig<unknown>]) => f.error)
            .map(([k, f]: [string, FieldConfig<unknown>]) => [k, f.error])
        ) as { [K in keyof T]?: string },
      };
    });
  }, []);

  // Reset form
  const resetForm = useCallback((newValues?: Partial<T>) => {
    const values = { ...initialValues, ...newValues };
    const fields = {} as FormState<T>['fields'];
    
    Object.keys(values).forEach(key => {
      const fieldKey = key as keyof T;
      fields[fieldKey] = {
        value: values[fieldKey],
        error: undefined,
        touched: false,
        dirty: false,
        validationRules: validationRules[fieldKey],
      };
    });

    setFormState({
      fields,
      isValid: true,
      isDirty: false,
      isSubmitting: false,
      submitCount: 0,
      errors: {},
    });
  }, [initialValues, validationRules]);

  // Submit form
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    setFormState(prev => ({ ...prev, isSubmitting: true }));

    // Validate all fields
    const { newFields, newErrors, isValid } = validateAllFields();
    
    // Mark all fields as touched
    Object.keys(newFields).forEach(key => {
      const fieldKey = key as keyof T;
      newFields[fieldKey] = { ...newFields[fieldKey], touched: true };
    });

    setFormState(prev => ({
      ...prev,
      fields: newFields,
      errors: newErrors,
      isValid,
      submitCount: prev.submitCount + 1,
    }));

    if (isValid && onSubmit) {
      try {
        const values = Object.fromEntries(
          Object.entries(newFields).map(([k, f]: [string, FieldConfig<unknown>]) => [k, f.value])
        ) as T;
        
        await onSubmit(values);
      } catch (error) {
        logger.error('Form submission error:', 'hooks', {}, error as Error);
      }
    }

    setFormState(prev => ({ ...prev, isSubmitting: false }));

    return isValid;
  }, [validateAllFields, onSubmit]);

  // Get field props for easy integration
  const getFieldProps = useCallback((key: keyof T) => {
    const field = formState.fields[key];
    return {
      value: field.value,
      onChange: (value: T[keyof T]) => setFieldValue(key, value),
      onBlur: () => setFieldTouched(key, true),
      error: field.error,
      touched: field.touched,
      dirty: field.dirty,
    };
  }, [formState.fields, setFieldValue, setFieldTouched]);

  // Get form values
  const values = useMemo(() => {
    return Object.fromEntries(
      Object.entries(formState.fields).map(([k, f]: [string, FieldConfig<unknown>]) => [k, f.value])
    ) as T;
  }, [formState.fields]);

  // Get touched fields
  const touchedFields = useMemo(() => {
    return Object.fromEntries(
      Object.entries(formState.fields)
        .filter(([, f]: [string, FieldConfig<unknown>]) => f.touched)
        .map(([k]) => [k, true])
    ) as { [K in keyof T]?: boolean };
  }, [formState.fields]);

  // Get dirty fields
  const dirtyFields = useMemo(() => {
    return Object.fromEntries(
      Object.entries(formState.fields)
        .filter(([, f]: [string, FieldConfig<unknown>]) => f.dirty)
        .map(([k]) => [k, true])
    ) as { [K in keyof T]?: boolean };
  }, [formState.fields]);

  return {
    // State
    values,
    errors: formState.errors,
    isValid: formState.isValid,
    isDirty: formState.isDirty,
    isSubmitting: formState.isSubmitting,
    submitCount: formState.submitCount,
    touchedFields,
    dirtyFields,

    // Actions
    setFieldValue,
    setFieldTouched,
    setFieldError,
    resetForm,
    handleSubmit,
    getFieldProps,

    // Utilities
    validateField,
    validateAllFields,
  };
}