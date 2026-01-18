/**
 * FormErrorProvider - Centralized form validation error management
 * 
 * Provides consistent form error handling, validation patterns, and
 * user-friendly error messaging across all forms in the application
 */

import React, { createContext, useContext, useCallback, useState } from 'react';
import { LoggingService } from '@/services/LoggingService';
// import { ErrorClassificationService } from '@/services/error/ErrorClassificationService'; // For future enhancement

export interface FormFieldError {
  field: string;
  message: string;
  code: string;
  severity: 'warning' | 'error';
  validationRule?: string;
}

export interface FormValidationResult {
  isValid: boolean;
  errors: FormFieldError[];
  warnings: FormFieldError[];
  globalError?: string;
  touchedFields: Set<string>;
}

export interface ValidationRule {
  name: string;
  validator: (value: unknown, formData?: Record<string, unknown>) => boolean | Promise<boolean>;
  message: string;
  severity: 'warning' | 'error';
  debounceMs?: number;
}

export interface FieldValidationConfig {
  rules: ValidationRule[];
  required?: boolean;
  requiredMessage?: string;
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
  debounceMs?: number;
}

interface FormErrorContextValue {
  // Form state
  validationResults: Record<string, FormValidationResult>;
  isValidating: Record<string, boolean>;
  
  // Form registration
  registerForm: (formId: string, config?: FormConfig) => void;
  unregisterForm: (formId: string) => void;
  
  // Field registration
  registerField: (formId: string, fieldName: string, config: FieldValidationConfig) => void;
  unregisterField: (formId: string, fieldName: string) => void;
  
  // Validation
  validateField: (formId: string, fieldName: string, value: unknown, formData?: Record<string, unknown>) => Promise<FormFieldError[]>;
  validateForm: (formId: string, formData: Record<string, unknown>) => Promise<FormValidationResult>;
  
  // Error management
  setFieldError: (formId: string, fieldName: string, error: FormFieldError) => void;
  clearFieldErrors: (formId: string, fieldName?: string) => void;
  setGlobalError: (formId: string, error: string) => void;
  clearGlobalError: (formId: string) => void;
  
  // Field interaction
  touchField: (formId: string, fieldName: string) => void;
  isFieldTouched: (formId: string, fieldName: string) => boolean;
  
  // Utilities
  getFieldErrors: (formId: string, fieldName: string) => FormFieldError[];
  getFormErrors: (formId: string) => FormValidationResult | undefined;
  hasErrors: (formId: string) => boolean;
  hasWarnings: (formId: string) => boolean;
}

interface FormConfig {
  validateOnSubmit?: boolean;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  showWarnings?: boolean;
  clearErrorsOnChange?: boolean;
}

interface FormErrorProviderState {
  forms: Record<string, {
    config: FormConfig;
    fields: Record<string, FieldValidationConfig>;
    validationResult: FormValidationResult;
    isValidating: boolean;
  }>;
}

const defaultFormConfig: FormConfig = {
  validateOnSubmit: true,
  validateOnChange: false,
  validateOnBlur: true,
  showWarnings: true,
  clearErrorsOnChange: true
};

const defaultValidationResult: FormValidationResult = {
  isValid: true,
  errors: [],
  warnings: [],
  touchedFields: new Set()
};

const FormErrorContext = createContext<FormErrorContextValue | undefined>(undefined);

export const FormErrorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<FormErrorProviderState>({ forms: {} });
  const loggingService = LoggingService.getInstance();
  // Note: ErrorClassificationService will be integrated in future enhancement
  // const errorClassificationService = ErrorClassificationService.getInstance();

  // Built-in validation rules
  const builtInRules: Record<string, ValidationRule> = {
    required: {
      name: 'required',
      validator: (value) => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        return Boolean(value);
      },
      message: 'This field is required',
      severity: 'error'
    },
    email: {
      name: 'email',
      validator: (value) => {
        if (!value) return true; // Only validate if value exists
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(String(value));
      },
      message: 'Please enter a valid email address',
      severity: 'error'
    },
    phone: {
      name: 'phone',
      validator: (value) => {
        if (!value) return true;
        const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
        return phoneRegex.test(String(value).replace(/\s/g, ''));
      },
      message: 'Please enter a valid phone number',
      severity: 'error'
    },
    minLength: {
      name: 'minLength',
      validator: (value, _formData, minLength = 1) => {
        if (!value) return true;
        return value.toString().length >= minLength;
      },
      message: 'Minimum length not met',
      severity: 'error'
    },
    maxLength: {
      name: 'maxLength',
      validator: (value, _formData, maxLength = 255) => {
        if (!value) return true;
        return value.toString().length <= maxLength;
      },
      message: 'Maximum length exceeded',
      severity: 'error'
    },
    dogName: {
      name: 'dogName',
      validator: (value) => {
        if (!value) return true;
        // Dog names should be 2-50 characters, letters, spaces, apostrophes, and hyphens
        const dogNameRegex = /^[a-zA-Z\s'-]{2,50}$/;
        return dogNameRegex.test(String(value));
      },
      message: 'Dog name should be 2-50 characters using only letters, spaces, apostrophes, and hyphens',
      severity: 'error'
    },
    registrationNumber: {
      name: 'registrationNumber',
      validator: (value) => {
        if (!value) return true;
        // Registration numbers are typically alphanumeric
        const regNumberRegex = /^[a-zA-Z0-9-]{3,20}$/;
        return regNumberRegex.test(String(value));
      },
      message: 'Registration number should be 3-20 alphanumeric characters',
      severity: 'error'
    },
    positiveNumber: {
      name: 'positiveNumber',
      validator: (value) => {
        if (!value && value !== 0) return true;
        const num = Number(value);
        return !isNaN(num) && num >= 0;
      },
      message: 'Please enter a positive number',
      severity: 'error'
    },
    currency: {
      name: 'currency',
      validator: (value) => {
        if (!value) return true;
        const currencyRegex = /^\d+(\.\d{1,2})?$/;
        return currencyRegex.test(String(value));
      },
      message: 'Please enter a valid amount (e.g., 25.00)',
      severity: 'error'
    },
    date: {
      name: 'date',
      validator: (value) => {
        if (!value) return true;
        const date = new Date(String(value));
        return !isNaN(date.getTime());
      },
      message: 'Please enter a valid date',
      severity: 'error'
    },
    futureDate: {
      name: 'futureDate',
      validator: (value) => {
        if (!value) return true;
        const date = new Date(String(value));
        return date > new Date();
      },
      message: 'Date must be in the future',
      severity: 'error'
    }
  };

  const registerForm = useCallback((formId: string, config: FormConfig = {}) => {
    setState(prev => ({
      ...prev,
      forms: {
        ...prev.forms,
        [formId]: {
          config: { ...defaultFormConfig, ...config },
          fields: {},
          validationResult: { ...defaultValidationResult },
          isValidating: false
        }
      }
    }));

    loggingService.info(`Form registered: ${formId}`, 'form-validation', { formId, config });
  }, [loggingService]);

  const unregisterForm = useCallback((formId: string) => {
    setState(prev => {
      const { [formId]: _removed, ...remaining } = prev.forms;
      return { ...prev, forms: remaining };
    });

    loggingService.info(`Form unregistered: ${formId}`, 'form-validation', { formId });
  }, [loggingService]);

  const registerField = useCallback((formId: string, fieldName: string, config: FieldValidationConfig) => {
    setState(prev => {
      const form = prev.forms[formId];
      if (!form) return prev;

      return {
        ...prev,
        forms: {
          ...prev.forms,
          [formId]: {
            ...form,
            fields: {
              ...form.fields,
              [fieldName]: config
            }
          }
        }
      };
    });
  }, []);

  const unregisterField = useCallback((formId: string, fieldName: string) => {
    setState(prev => {
      const form = prev.forms[formId];
      if (!form) return prev;

      const { [fieldName]: _removed, ...remainingFields } = form.fields;
      
      return {
        ...prev,
        forms: {
          ...prev.forms,
          [formId]: {
            ...form,
            fields: remainingFields
          }
        }
      };
    });
  }, []);

  const validateField = useCallback(async (
    formId: string, 
    fieldName: string, 
    value: unknown, 
    formData?: Record<string, unknown>
  ): Promise<FormFieldError[]> => {
    const form = state.forms[formId];
    if (!form) return [];

    const fieldConfig = form.fields[fieldName];
    if (!fieldConfig) return [];

    const errors: FormFieldError[] = [];

    // Check required validation
    if (fieldConfig.required) {
      const requiredRule = builtInRules.required;
      const isValid = await requiredRule.validator(value, formData);
      if (!isValid) {
        errors.push({
          field: fieldName,
          message: fieldConfig.requiredMessage || requiredRule.message,
          code: 'required',
          severity: 'error',
          validationRule: 'required'
        });
      }
    }

    // Run custom validation rules
    for (const rule of fieldConfig.rules) {
      try {
        const isValid = await rule.validator(value, formData);
        if (!isValid) {
          errors.push({
            field: fieldName,
            message: rule.message,
            code: rule.name,
            severity: rule.severity,
            validationRule: rule.name
          });
        }
      } catch (error) {
        loggingService.error(`Validation rule error: ${rule.name}`, 'form-validation', {
          formId,
          fieldName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        errors.push({
          field: fieldName,
          message: 'Validation error occurred',
          code: 'validation_error',
          severity: 'error',
          validationRule: rule.name
        });
      }
    }

    return errors;
  }, [state.forms, loggingService, builtInRules.required]);

  const validateForm = useCallback(async (formId: string, formData: Record<string, unknown>): Promise<FormValidationResult> => {
    const form = state.forms[formId];
    if (!form) return defaultValidationResult;

    setState(prev => ({
      ...prev,
      forms: {
        ...prev.forms,
        [formId]: { ...form, isValidating: true }
      }
    }));

    const allErrors: FormFieldError[] = [];
    const allWarnings: FormFieldError[] = [];

    // Validate all fields
    for (const [fieldName] of Object.entries(form.fields)) {
      const fieldValue = formData[fieldName];
      const fieldErrors = await validateField(formId, fieldName, fieldValue, formData);
      
      fieldErrors.forEach(error => {
        if (error.severity === 'error') {
          allErrors.push(error);
        } else {
          allWarnings.push(error);
        }
      });
    }

    const result: FormValidationResult = {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      touchedFields: form.validationResult.touchedFields
    };

    setState(prev => ({
      ...prev,
      forms: {
        ...prev.forms,
        [formId]: {
          ...form,
          validationResult: result,
          isValidating: false
        }
      }
    }));

    loggingService.info(`Form validation completed: ${formId}`, 'form-validation', {
      formId,
      isValid: result.isValid,
      errorCount: allErrors.length,
      warningCount: allWarnings.length
    });

    return result;
  }, [state.forms, validateField, loggingService]);

  const setFieldError = useCallback((formId: string, fieldName: string, error: FormFieldError) => {
    setState(prev => {
      const form = prev.forms[formId];
      if (!form) return prev;

      const errors = form.validationResult.errors.filter(e => e.field !== fieldName);
      errors.push(error);

      return {
        ...prev,
        forms: {
          ...prev.forms,
          [formId]: {
            ...form,
            validationResult: {
              ...form.validationResult,
              errors,
              isValid: errors.length === 0
            }
          }
        }
      };
    });
  }, []);

  const clearFieldErrors = useCallback((formId: string, fieldName?: string) => {
    setState(prev => {
      const form = prev.forms[formId];
      if (!form) return prev;

      const errors = fieldName ? 
        form.validationResult.errors.filter(e => e.field !== fieldName) :
        [];
      
      const warnings = fieldName ?
        form.validationResult.warnings.filter(e => e.field !== fieldName) :
        [];

      return {
        ...prev,
        forms: {
          ...prev.forms,
          [formId]: {
            ...form,
            validationResult: {
              ...form.validationResult,
              errors,
              warnings,
              isValid: errors.length === 0
            }
          }
        }
      };
    });
  }, []);

  const setGlobalError = useCallback((formId: string, error: string) => {
    setState(prev => {
      const form = prev.forms[formId];
      if (!form) return prev;

      return {
        ...prev,
        forms: {
          ...prev.forms,
          [formId]: {
            ...form,
            validationResult: {
              ...form.validationResult,
              globalError: error,
              isValid: false
            }
          }
        }
      };
    });
  }, []);

  const clearGlobalError = useCallback((formId: string) => {
    setState(prev => {
      const form = prev.forms[formId];
      if (!form) return prev;

      // Create new validation result without globalError property
      const { globalError: _, ...validationResultWithoutGlobalError } = form.validationResult;
      void _;

      return {
        ...prev,
        forms: {
          ...prev.forms,
          [formId]: {
            ...form,
            validationResult: {
              ...validationResultWithoutGlobalError,
              isValid: form.validationResult.errors.length === 0
            }
          }
        }
      };
    });
  }, []);

  const touchField = useCallback((formId: string, fieldName: string) => {
    setState(prev => {
      const form = prev.forms[formId];
      if (!form) return prev;

      const touchedFields = new Set(form.validationResult.touchedFields);
      touchedFields.add(fieldName);

      return {
        ...prev,
        forms: {
          ...prev.forms,
          [formId]: {
            ...form,
            validationResult: {
              ...form.validationResult,
              touchedFields
            }
          }
        }
      };
    });
  }, []);

  const isFieldTouched = useCallback((formId: string, fieldName: string): boolean => {
    const form = state.forms[formId];
    return form?.validationResult.touchedFields.has(fieldName) || false;
  }, [state.forms]);

  const getFieldErrors = useCallback((formId: string, fieldName: string): FormFieldError[] => {
    const form = state.forms[formId];
    if (!form) return [];
    
    return form.validationResult.errors.filter(error => error.field === fieldName);
  }, [state.forms]);

  const getFormErrors = useCallback((formId: string): FormValidationResult | undefined => {
    return state.forms[formId]?.validationResult;
  }, [state.forms]);

  const hasErrors = useCallback((formId: string): boolean => {
    const form = state.forms[formId];
    return form ? form.validationResult.errors.length > 0 || !!form.validationResult.globalError : false;
  }, [state.forms]);

  const hasWarnings = useCallback((formId: string): boolean => {
    const form = state.forms[formId];
    return form ? form.validationResult.warnings.length > 0 : false;
  }, [state.forms]);

  const contextValue: FormErrorContextValue = {
    validationResults: Object.fromEntries(
      Object.entries(state.forms).map(([id, form]) => [id, form.validationResult])
    ),
    isValidating: Object.fromEntries(
      Object.entries(state.forms).map(([id, form]) => [id, form.isValidating])
    ),
    registerForm,
    unregisterForm,
    registerField,
    unregisterField,
    validateField,
    validateForm,
    setFieldError,
    clearFieldErrors,
    setGlobalError,
    clearGlobalError,
    touchField,
    isFieldTouched,
    getFieldErrors,
    getFormErrors,
    hasErrors,
    hasWarnings
  };

  return (
    <FormErrorContext.Provider value={contextValue}>
      {children}
    </FormErrorContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useFormError = (): FormErrorContextValue => {
  const context = useContext(FormErrorContext);
  if (!context) {
    throw new Error('useFormError must be used within a FormErrorProvider');
  }
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useFormValidation = (formId: string) => {
  const formError = useFormError();
  
  return {
    registerForm: (config?: FormConfig) => formError.registerForm(formId, config),
    unregisterForm: () => formError.unregisterForm(formId),
    registerField: (fieldName: string, config: FieldValidationConfig) => 
      formError.registerField(formId, fieldName, config),
    validateForm: (formData: Record<string, unknown>) => formError.validateForm(formId, formData),
    validationResult: formError.getFormErrors(formId),
    isValidating: formError.isValidating[formId] || false,
    hasErrors: formError.hasErrors(formId),
    hasWarnings: formError.hasWarnings(formId),
    setGlobalError: (error: string) => formError.setGlobalError(formId, error),
    clearGlobalError: () => formError.clearGlobalError(formId)
  };
};