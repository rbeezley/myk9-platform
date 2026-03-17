/**
 * Secure Form Component
 * Provides enhanced security features for form handling
 */

import React, { useEffect, useState, useCallback, ReactNode } from 'react';
import { useFormSecurity } from '../../hooks/useSecurityValidation';
import { cn } from '@/lib/utils';
import { AlertTriangle, Shield, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/services/LoggingService';

/**
 * Security indicator component
 */
interface SecurityIndicatorProps {
  level: 'secure' | 'warning' | 'danger';
  message: string;
  className?: string;
}

function SecurityIndicator({ level, message, className }: SecurityIndicatorProps) {
  const icons = {
    secure: CheckCircle,
    warning: AlertTriangle,
    danger: AlertTriangle,
  };

  const colors = {
    secure: 'text-green-600 border-green-200 bg-green-50',
    warning: 'text-yellow-600 border-yellow-200 bg-yellow-50',
    danger: 'text-red-600 border-red-200 bg-red-50',
  };

  const Icon = icons[level];

  return (
    <Alert className={cn(colors[level], className)}>
      <Icon className="h-4 w-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * Props for SecureForm component
 */
interface SecureFormProps {
  children: ReactNode;
  onSubmit: (data: FormData, csrfToken: string) => Promise<void> | void;
  className?: string;
  validateOnBlur?: boolean;
  showSecurityIndicator?: boolean;
  encType?: 'application/x-www-form-urlencoded' | 'multipart/form-data';
  method?: 'GET' | 'POST';
  noValidate?: boolean;
  autoComplete?: 'on' | 'off';
  id?: string;
  'data-testid'?: string;
}

/**
 * Secure form component with CSRF protection and validation
 */
export function SecureForm({
  children,
  onSubmit,
  className,
  showSecurityIndicator = true,
  encType = 'application/x-www-form-urlencoded',
  method = 'POST',
  noValidate = true,
  autoComplete = 'off',
  id,
  'data-testid': testId,
  ...props
}: SecureFormProps) {
  const { initializeSecureForm } = useFormSecurity();
  const [formSecurity, setFormSecurity] = useState<{
    csrfToken: string;
    hiddenFields: Record<string, string>;
  } | null>(null);
  const [securityStatus, setSecurityStatus] = useState<{
    level: 'secure' | 'warning' | 'danger';
    message: string;
  }>({ level: 'secure', message: 'Form is secure' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form security on mount
  useEffect(() => {
    const security = initializeSecureForm();
    setFormSecurity(security);
  }, [initializeSecureForm]);

  // Check for security warnings
  useEffect(() => {
    if (!formSecurity) return;

    // Check if form is using HTTPS in production
    if (typeof window !== 'undefined') {
      const isHttps = window.location.protocol === 'https:';
      const isDev = window.location.hostname === 'localhost';

      if (!isHttps && !isDev) {
        setSecurityStatus({
          level: 'danger',
          message: 'Form is not using secure HTTPS connection',
        });
        return;
      }
    }

    // Check autocomplete setting for sensitive forms
    if (autoComplete === 'on') {
      setSecurityStatus({
        level: 'warning',
        message: 'Autocomplete is enabled - consider disabling for sensitive data',
      });
      return;
    }

    setSecurityStatus({
      level: 'secure',
      message: 'Form security active - CSRF protection enabled',
    });
  }, [formSecurity, autoComplete]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!formSecurity || isSubmitting) {
        return;
      }

      setIsSubmitting(true);

      try {
        const form = event.currentTarget;
        const formData = new FormData(form);

        // Add CSRF token to form data
        formData.append('_token', formSecurity.csrfToken);

        await onSubmit(formData, formSecurity.csrfToken);
      } catch (error) {
        logger.error('Form submission error:', 'components', {}, error as Error);
        // Reset security token on error (may be expired)
        const newSecurity = initializeSecureForm();
        setFormSecurity(newSecurity);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formSecurity, isSubmitting, onSubmit, initializeSecureForm]
  );

  if (!formSecurity) {
    return (
      <div className="flex items-center justify-center p-4">
        <Shield className="h-5 w-5 mr-2 animate-pulse" />
        <span>Initializing secure form...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showSecurityIndicator && (
        <SecurityIndicator
          level={securityStatus.level}
          message={securityStatus.message}
          className="text-sm"
        />
      )}

      <form
        id={id}
        data-testid={testId}
        className={cn('space-y-4', className)}
        onSubmit={handleSubmit}
        encType={encType}
        method={method}
        noValidate={noValidate}
        autoComplete={autoComplete}
        {...props}
      >
        {/* Hidden security fields */}
        {Object.entries(formSecurity.hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} readOnly />
        ))}

        {/* Form content */}
        {children}

        {/* Security metadata */}
        <input type="hidden" name="_timestamp" value={Date.now().toString()} readOnly />
        <input
          type="hidden"
          name="_userAgent"
          value={typeof navigator !== 'undefined' ? navigator.userAgent : ''}
          readOnly
        />
      </form>
    </div>
  );
}

/**
 * Secure input component with validation
 */
interface SecureInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  validatePattern?: RegExp;
  sanitize?: boolean;
  securityLevel?: 'low' | 'medium' | 'high';
}

export function SecureInput({
  label,
  error,
  validatePattern,
  sanitize = true,
  securityLevel = 'medium',
  className,
  onChange,
  onBlur,
  ...props
}: SecureInputProps) {
  const [value, setValue] = useState(props.value || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasSecurity, setHasSecurity] = useState(true);

  const validateInput = useCallback(
    (inputValue: string) => {
      // Basic security checks
      const hasScript = /<script[^>]*>.*?<\/script>/gi.test(inputValue);
      const hasJavascript = /javascript:/gi.test(inputValue);
      const hasSqlInjection = /(union|select|insert|update|delete|drop)/gi.test(inputValue);

      if (hasScript || hasJavascript || hasSqlInjection) {
        setValidationError('Input contains potentially dangerous content');
        setHasSecurity(false);
        return false;
      }

      // Pattern validation
      if (validatePattern && !validatePattern.test(inputValue)) {
        setValidationError('Input format is invalid');
        return false;
      }

      setValidationError(null);
      setHasSecurity(true);
      return true;
    },
    [validatePattern]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = event.target.value;

      // Sanitize input if enabled
      if (sanitize) {
        // Basic sanitization - remove potentially dangerous characters
        newValue = newValue.replace(/<[^>]*>/g, ''); // Remove HTML tags
        newValue = newValue.replace(/[<>"'&]/g, ''); // Remove dangerous characters
      }

      setValue(newValue);
      validateInput(newValue);

      // Call original onChange with sanitized value
      if (onChange) {
        const syntheticEvent = {
          ...event,
          target: { ...event.target, value: newValue },
        };
        onChange(syntheticEvent);
      }
    },
    [sanitize, validateInput, onChange]
  );

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      validateInput(event.target.value);
      if (onBlur) {
        onBlur(event);
      }
    },
    [validateInput, onBlur]
  );

  const displayError = validationError || error;

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium flex items-center gap-2">
          {label}
          {securityLevel === 'high' && (
            <Shield className={cn('h-3 w-3', hasSecurity ? 'text-green-600' : 'text-red-600')} />
          )}
        </label>
      )}

      <input
        {...props}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500',
          displayError ? 'border-destructive focus-visible:ring-destructive' : 'border-gray-300',
          !hasSecurity && 'border-destructive bg-destructive/5',
          className
        )}
      />

      {displayError && (
        <div className="flex items-center text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mr-1" />
          {displayError}
        </div>
      )}
    </div>
  );
}

/**
 * Secure textarea component
 */
interface SecureTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  maxLength?: number;
  sanitize?: boolean;
}

export function SecureTextarea({
  label,
  error,
  maxLength = 2000,
  sanitize = true,
  className,
  onChange,
  ...props
}: SecureTextareaProps) {
  const [value, setValue] = useState(props.value || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateContent = useCallback(
    (content: string) => {
      // Check for potentially dangerous content
      const hasScript = /<script[^>]*>.*?<\/script>/gi.test(content);
      const hasJavascript = /javascript:/gi.test(content);

      if (hasScript || hasJavascript) {
        setValidationError('Content contains potentially dangerous scripts');
        return false;
      }

      if (content.length > maxLength) {
        setValidationError(`Content exceeds maximum length of ${maxLength} characters`);
        return false;
      }

      setValidationError(null);
      return true;
    },
    [maxLength]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      let newValue = event.target.value;

      // Basic sanitization if enabled
      if (sanitize) {
        // Remove script tags and dangerous attributes
        newValue = newValue.replace(/<script[^>]*>.*?<\/script>/gi, '');
        newValue = newValue.replace(/javascript:/gi, '');
        newValue = newValue.replace(/on\w+="[^"]*"/gi, '');
      }

      setValue(newValue);
      validateContent(newValue);

      if (onChange) {
        const syntheticEvent = {
          ...event,
          target: { ...event.target, value: newValue },
        };
        onChange(syntheticEvent);
      }
    },
    [sanitize, validateContent, onChange]
  );

  const displayError = validationError || error;
  const remainingChars = maxLength - (typeof value === 'string' ? value.length : 0);

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}

      <textarea
        {...props}
        value={value}
        onChange={handleChange}
        maxLength={maxLength}
        className={cn(
          'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical',
          displayError ? 'border-destructive focus-visible:ring-destructive' : 'border-gray-300',
          className
        )}
      />

      <div className="flex justify-between items-center text-sm">
        <div>
          {displayError && (
            <div className="flex items-center text-destructive">
              <AlertTriangle className="h-4 w-4 mr-1" />
              {displayError}
            </div>
          )}
        </div>

        <div
          className={cn(
            'text-gray-500',
            remainingChars < 100 && 'text-yellow-600',
            remainingChars < 20 && 'text-red-600'
          )}
        >
          {remainingChars} characters remaining
        </div>
      </div>
    </div>
  );
}

export default SecureForm;
