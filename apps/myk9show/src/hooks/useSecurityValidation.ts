/**
 * Security Validation Hook
 * Provides security-focused validation utilities for forms and user input
 */

import { useCallback, useMemo } from 'react';
import { 
  InputValidator, 
  ValidationSchemas, 
  validateFormData,
  validateFileUpload,
  SecurityValidation,
  rateLimiter
} from '../utils/inputValidation';
import { z } from 'zod';
import { CSRFTokenManager } from '../config/security';

/**
 * Security validation hook
 */
export function useSecurityValidation() {
  const csrfManager = useMemo(() => CSRFTokenManager.getInstance(), []);
  
  /**
   * Validate form with CSRF protection
   */
  const validateSecureForm = useCallback(<T extends Record<string, unknown>>(
    data: T,
    schema: z.ZodSchema<T>,
    csrfToken?: string
  ) => {
    // Validate CSRF token if provided
    if (csrfToken && !csrfManager.validateToken(csrfToken)) {
      return {
        isValid: false,
        errors: { _csrf: 'Invalid or expired security token. Please refresh and try again.' }
      };
    }
    
    // Check for malicious patterns in string fields
    const stringFields = Object.entries(data).filter(([, value]) => typeof value === 'string');
    const suspiciousField = stringFields.find(([, value]) => 
      !SecurityValidation.isSafeInput(value as string)
    );
    
    if (suspiciousField) {
      return {
        isValid: false,
        errors: { 
          [suspiciousField[0]]: 'Input contains potentially dangerous content'
        }
      };
    }
    
    // Perform standard validation
    return validateFormData(data, schema);
  }, [csrfManager]);
  
  /**
   * Rate-limited validation
   */
  const validateWithRateLimit = useCallback(<T extends Record<string, unknown>>(
    identifier: string,
    data: T,
    schema: z.ZodSchema<T>,
    maxAttempts = 5,
    windowMs = 60000
  ) => {
    // Check rate limit
    if (rateLimiter.isRateLimited(identifier, maxAttempts, windowMs)) {
      return {
        isValid: false,
        errors: { _rate: 'Too many attempts. Please wait before trying again.' }
      };
    }
    
    return validateFormData(data, schema);
  }, []);
  
  /**
   * Validate file upload with security checks
   */
  const validateSecureFile = useCallback((
    file: File,
    allowedTypes: string[],
    maxSize: number
  ) => {
    // Basic file validation
    const result = validateFileUpload(file, allowedTypes, maxSize);
    if (!result.isValid) {
      return result;
    }
    
    // Additional security checks
    const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];
    const hasDoubleExtension = /\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/.test(file.name);
    const hasSuspiciousExtension = suspiciousExtensions.some(ext => 
      file.name.toLowerCase().includes(ext)
    );
    
    if (hasDoubleExtension || hasSuspiciousExtension) {
      return {
        isValid: false,
        error: 'File appears to have a suspicious filename or extension'
      };
    }
    
    return { isValid: true };
  }, []);
  
  /**
   * Generate CSRF token for forms
   */
  const generateCSRFToken = useCallback(() => {
    return csrfManager.generateToken();
  }, [csrfManager]);
  
  /**
   * Clear rate limit for user
   */
  const clearRateLimit = useCallback((identifier: string) => {
    rateLimiter.clearRateLimit(identifier);
  }, []);
  
  /**
   * Validate password strength
   */
  const validatePassword = useCallback((password: string) => {
    const validator = new InputValidator();
    validator.pattern(
      password,
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/,
      'password',
      'Password must be at least 12 characters with uppercase, lowercase, number, and special character'
    );
    
    // Additional checks
    const commonPasswords = [
      'password123', '123456789', 'qwerty123', 'admin123',
      'letmein123', 'welcome123', 'password1'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      validator.custom(
        password,
        () => false,
        'password',
        'This password is too common and easily guessed'
      );
    }
    
    return {
      isValid: validator.isValid(),
      errors: validator.getErrors()
    };
  }, []);
  
  /**
   * Validate email with additional security checks
   */
  const validateSecureEmail = useCallback((email: string) => {
    const validator = new InputValidator();
    validator.email(email, 'email');
    
    // Check for potentially malicious patterns
    if (!SecurityValidation.isSafeInput(email)) {
      validator.custom(
        email,
        () => false,
        'email',
        'Email address contains invalid characters'
      );
    }
    
    // Check for suspicious TLDs (basic check)
    const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf'];
    const hasSuspiciousTld = suspiciousTlds.some(tld => email.toLowerCase().endsWith(tld));
    
    if (hasSuspiciousTld) {
      validator.custom(
        email,
        () => false,
        'email',
        'Email domain appears to be from a temporary email service'
      );
    }
    
    return {
      isValid: validator.isValid(),
      errors: validator.getErrors()
    };
  }, []);
  
  /**
   * Validate user input for XSS patterns
   */
  const checkForXSS = useCallback((input: string) => {
    return SecurityValidation.hasXSSPattern(input);
  }, []);
  
  /**
   * Validate user input for SQL injection patterns  
   */
  const checkForSQLInjection = useCallback((input: string) => {
    return SecurityValidation.hasSQLInjectionPattern(input);
  }, []);
  
  /**
   * Comprehensive security check for any user input
   */
  const performSecurityCheck = useCallback((input: string, fieldName: string) => {
    const issues: string[] = [];
    
    if (SecurityValidation.hasXSSPattern(input)) {
      issues.push('Contains potential XSS patterns');
    }
    
    if (SecurityValidation.hasSQLInjectionPattern(input)) {
      issues.push('Contains potential SQL injection patterns');
    }
    
    if (input.length > 10000) {
      issues.push('Input is unusually long');
    }
    
    // Check for excessive special characters
    const specialCharCount = (input.match(/[^a-zA-Z0-9\s]/g) || []).length;
    if (specialCharCount > input.length * 0.3) {
      issues.push('Contains excessive special characters');
    }
    
    return {
      isSecure: issues.length === 0,
      issues,
      fieldName
    };
  }, []);
  
  return {
    // Core validation functions
    validateSecureForm,
    validateWithRateLimit,
    validateSecureFile,
    
    // Security-specific validations
    validatePassword,
    validateSecureEmail,
    performSecurityCheck,
    
    // Security checks
    checkForXSS,
    checkForSQLInjection,
    
    // CSRF protection
    generateCSRFToken,
    
    // Rate limiting
    clearRateLimit,
    
    // Pre-built schemas
    schemas: ValidationSchemas,
    
    // Security validation utility
    SecurityValidation
  };
}

/**
 * Hook for form-specific security validation
 */
export function useFormSecurity() {
  const { validateSecureForm, generateCSRFToken } = useSecurityValidation();
  
  /**
   * Initialize secure form with CSRF token
   */
  const initializeSecureForm = useCallback(() => {
    const token = generateCSRFToken();
    return {
      csrfToken: token,
      hiddenFields: {
        _token: token
      }
    };
  }, [generateCSRFToken]);
  
  /**
   * Validate form submission with security checks
   */
  const validateFormSubmission = useCallback(<T extends Record<string, unknown>>(
    formData: T & { _token?: string },
    schema: z.ZodSchema<T>
  ) => {
    const { _token, ...data } = formData;
    return validateSecureForm(data as T, schema, _token);
  }, [validateSecureForm]);
  
  return {
    initializeSecureForm,
    validateFormSubmission
  };
}

/**
 * Hook for authentication-specific security
 */
export function useAuthSecurity() {
  const { validatePassword, validateSecureEmail, validateWithRateLimit } = useSecurityValidation();
  
  /**
   * Validate login attempt with rate limiting
   */
  const validateLoginAttempt = useCallback((
    email: string,
    password: string,
    ipAddress?: string
  ) => {
    const identifier = ipAddress || email;
    
    // Rate limit by IP/email
    const rateLimitResult = validateWithRateLimit(
      `login:${identifier}`,
      { email, password },
      z.object({
        email: ValidationSchemas.email,
        password: z.string().min(1, 'Password is required')
      }),
      5, // max 5 attempts
      900000 // 15 minute window
    );
    
    if (!rateLimitResult.isValid) {
      return rateLimitResult;
    }
    
    // Additional email validation
    const emailResult = validateSecureEmail(email);
    if (!emailResult.isValid) {
      return {
        isValid: false,
        errors: { email: emailResult.errors[0]?.message || 'Invalid email' }
      };
    }
    
    return { isValid: true, data: { email, password } };
  }, [validateSecureEmail, validateWithRateLimit]);
  
  /**
   * Validate registration data
   */
  const validateRegistration = useCallback((data: {
    email: string;
    password: string;
    confirmPassword: string;
    firstName: string;
    lastName: string;
  }) => {
    // Email validation
    const emailResult = validateSecureEmail(data.email);
    if (!emailResult.isValid) {
      return {
        isValid: false,
        errors: { email: emailResult.errors[0]?.message || 'Invalid email' }
      };
    }
    
    // Password validation
    const passwordResult = validatePassword(data.password);
    if (!passwordResult.isValid) {
      return {
        isValid: false,
        errors: { password: passwordResult.errors[0]?.message || 'Invalid password' }
      };
    }
    
    // Password confirmation
    if (data.password !== data.confirmPassword) {
      return {
        isValid: false,
        errors: { confirmPassword: 'Passwords do not match' }
      };
    }
    
    // Name validation
    const validator = new InputValidator();
    validator.safeString(data.firstName, 'firstName')
             .safeString(data.lastName, 'lastName');
    
    if (!validator.isValid()) {
      const errors = validator.getErrors().reduce((acc, err) => {
        acc[err.field] = err.message;
        return acc;
      }, {} as Record<string, string>);
      
      return {
        isValid: false,
        errors
      };
    }
    
    return { isValid: true, data };
  }, [validateSecureEmail, validatePassword]);
  
  return {
    validateLoginAttempt,
    validateRegistration
  };
}