import { useState, useCallback, useRef, useMemo } from 'react';
import { z } from 'zod';

export interface FormFieldInputProps {
  'aria-invalid': boolean;
  'aria-describedby': string;
  ref: React.RefCallback<HTMLElement>;
}

export interface FormValidation<T> {
  data: T;
  errors: Record<string, string>;
  setValue: (field: keyof T, value: unknown) => void;
  setValues: (partial: Partial<T>) => void;
  getError: (field: keyof T) => string | undefined;
  getFieldProps: (field: keyof T) => FormFieldInputProps;
  touchField: (field: keyof T) => void;
  handleSubmit: (onSave: (data: T) => Promise<void> | void) => () => Promise<void>;
  isSubmitting: boolean;
  isValid: boolean;
  reset: (data?: T) => void;
  hasChanges: boolean;
}

export function useFormValidation<T extends Record<string, unknown>>(
  schema: z.ZodSchema<T>,
  initialData: T
): FormValidation<T> {
  const [data, setData] = useState<T>(initialData);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialDataRef = useRef(initialData);
  const fieldRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Validate entire form against schema
  const validationErrors = useMemo(() => {
    const result = schema.safeParse(data);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    result.error.issues.forEach(issue => {
      if (issue.path.length > 0) {
        const key = issue.path[0] as string;
        if (!errors[key]) errors[key] = issue.message;
      }
    });
    return errors;
  }, [data, schema]);

  const isValid = Object.keys(validationErrors).length === 0;

  // Visible errors: only show for touched or submitted fields
  const errors = useMemo(() => {
    const visible: Record<string, string> = {};
    for (const [field, message] of Object.entries(validationErrors)) {
      if (touched.has(field) || submitted) {
        visible[field] = message;
      }
    }
    return visible;
  }, [validationErrors, touched, submitted]);

  const hasChanges = JSON.stringify(data) !== JSON.stringify(initialDataRef.current);

  const setValue = useCallback((field: keyof T, value: unknown) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const setValues = useCallback((partial: Partial<T>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  const getError = useCallback(
    (field: keyof T): string | undefined => errors[field as string],
    [errors]
  );

  const touchField = useCallback((field: keyof T) => {
    setTouched(prev => {
      const next = new Set(prev);
      next.add(field as string);
      return next;
    });
  }, []);

  const getFieldProps = useCallback(
    (field: keyof T): FormFieldInputProps => {
      const fieldStr = field as string;
      const hasError = !!errors[fieldStr];
      return {
        'aria-invalid': hasError,
        'aria-describedby': `${fieldStr}-error`,
        ref: (el: HTMLElement | null) => {
          if (el) fieldRefs.current.set(fieldStr, el);
          else fieldRefs.current.delete(fieldStr);
        },
      };
    },
    [errors]
  );

  const handleSubmit = useCallback(
    (onSave: (data: T) => Promise<void> | void) => {
      return async () => {
        setSubmitted(true);
        // Mark all fields as touched
        const allFields = Object.keys(data);
        setTouched(new Set(allFields));

        const result = schema.safeParse(data);
        if (!result.success) {
          // Find first error field and scroll to it
          const firstErrorField = result.error.issues[0]?.path[0] as string;
          if (firstErrorField) {
            const el = fieldRefs.current.get(firstErrorField);
            if (el) {
              el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
              if (
                el instanceof HTMLInputElement ||
                el instanceof HTMLSelectElement ||
                el instanceof HTMLTextAreaElement
              ) {
                el.focus();
              }
              // Trigger pulse animation on error message
              const errorEl = document.getElementById(`${firstErrorField}-error`);
              if (errorEl) {
                errorEl.classList.remove('animate-pulse-error');
                // Force reflow to restart animation
                void errorEl.offsetWidth;
                errorEl.classList.add('animate-pulse-error');
              }
            }
          }
          return;
        }

        try {
          setIsSubmitting(true);
          await onSave(result.data);
        } finally {
          setIsSubmitting(false);
        }
      };
    },
    [data, schema]
  );

  const reset = useCallback((newData?: T) => {
    const resetTo = newData ?? initialDataRef.current;
    setData(resetTo);
    setTouched(new Set());
    setSubmitted(false);
    if (newData) initialDataRef.current = newData;
  }, []);

  return {
    data,
    errors,
    setValue,
    setValues,
    getError,
    getFieldProps,
    touchField,
    handleSubmit,
    isSubmitting,
    isValid,
    reset,
    hasChanges,
  };
}
