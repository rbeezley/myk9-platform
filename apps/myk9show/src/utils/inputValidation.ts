/**
 * Enhanced Input Validation Utilities
 * Provides comprehensive input validation and sanitization for security
 */

import { sanitizeHTML } from './sanitization';
import { z } from 'zod';

/**
 * Common validation patterns
 */
export const VALIDATION_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^[+]?[1-9][\d]{0,3}[\s-]?[(]?[0-9]{1,4}[)]?[\s-]?[0-9]{1,4}[\s-]?[0-9]{1,9}$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  alphanumericWithSpaces: /^[a-zA-Z0-9\s]+$/,
  noSpecialChars: /^[a-zA-Z0-9\s\-_.]+$/,
  safeString: /^[a-zA-Z0-9\s\-_.!?,:;()[\]"']+$/, // Safe characters for text content
  positiveInteger: /^[1-9]\d*$/,
  decimal: /^\d+(\.\d{1,2})?$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/
} as const;

/**
 * Input length limits for security
 */
export const INPUT_LIMITS = {
  shortText: 50,     // Names, titles
  mediumText: 255,   // Descriptions, addresses
  longText: 2000,    // Comments, notes
  veryLongText: 10000, // Rich text content
  email: 254,        // RFC 5321 limit
  phone: 20,
  url: 2048,
  filename: 255
} as const;

/**
 * Validation error types
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Base validator class
 */
export class InputValidator {
  private errors: ValidationError[] = [];

  /**
   * Add validation error
   */
  private addError(field: string, message: string, code: string) {
    this.errors.push({ field, message, code });
  }

  /**
   * Get all validation errors
   */
  getErrors(): ValidationError[] {
    return this.errors;
  }

  /**
   * Check if validation passed
   */
  isValid(): boolean {
    return this.errors.length === 0;
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Validate required field
   */
  required(value: unknown, fieldName: string): this {
    if (value === null || value === undefined || value === '') {
      this.addError(fieldName, `${fieldName} is required`, 'REQUIRED');
    }
    return this;
  }

  /**
   * Validate string length
   */
  length(value: string, min: number, max: number, fieldName: string): this {
    if (typeof value !== 'string') {
      this.addError(fieldName, `${fieldName} must be a string`, 'INVALID_TYPE');
      return this;
    }

    if (value.length < min) {
      this.addError(fieldName, `${fieldName} must be at least ${min} characters`, 'TOO_SHORT');
    }
    
    if (value.length > max) {
      this.addError(fieldName, `${fieldName} must be no more than ${max} characters`, 'TOO_LONG');
    }
    
    return this;
  }

  /**
   * Validate string pattern
   */
  pattern(value: string, pattern: RegExp, fieldName: string, message?: string): this {
    if (typeof value !== 'string') {
      this.addError(fieldName, `${fieldName} must be a string`, 'INVALID_TYPE');
      return this;
    }

    if (!pattern.test(value)) {
      this.addError(
        fieldName, 
        message || `${fieldName} format is invalid`, 
        'INVALID_FORMAT'
      );
    }
    
    return this;
  }

  /**
   * Validate email format
   */
  email(value: string, fieldName: string): this {
    return this.pattern(
      value, 
      VALIDATION_PATTERNS.email, 
      fieldName, 
      'Please enter a valid email address'
    ).length(value, 1, INPUT_LIMITS.email, fieldName);
  }

  /**
   * Validate phone number
   */
  phone(value: string, fieldName: string): this {
    return this.pattern(
      value,
      VALIDATION_PATTERNS.phone,
      fieldName,
      'Please enter a valid phone number'
    ).length(value, 1, INPUT_LIMITS.phone, fieldName);
  }

  /**
   * Validate UUID format
   */
  uuid(value: string, fieldName: string): this {
    return this.pattern(
      value,
      VALIDATION_PATTERNS.uuid,
      fieldName,
      'Invalid ID format'
    );
  }

  /**
   * Validate safe string (no dangerous characters)
   */
  safeString(value: string, fieldName: string): this {
    return this.pattern(
      value,
      VALIDATION_PATTERNS.safeString,
      fieldName,
      `${fieldName} contains invalid characters`
    );
  }

  /**
   * Validate positive number
   */
  positiveNumber(value: number, fieldName: string): this {
    if (typeof value !== 'number' || isNaN(value)) {
      this.addError(fieldName, `${fieldName} must be a valid number`, 'INVALID_TYPE');
      return this;
    }

    if (value <= 0) {
      this.addError(fieldName, `${fieldName} must be a positive number`, 'INVALID_VALUE');
    }
    
    return this;
  }

  /**
   * Validate date
   */
  date(value: string | Date, fieldName: string): this {
    const date = typeof value === 'string' ? new Date(value) : value;
    
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      this.addError(fieldName, `${fieldName} must be a valid date`, 'INVALID_DATE');
    }
    
    return this;
  }

  /**
   * Validate future date
   */
  futureDate(value: string | Date, fieldName: string): this {
    this.date(value, fieldName);
    
    const date = typeof value === 'string' ? new Date(value) : value;
    if (date instanceof Date && !isNaN(date.getTime()) && date <= new Date()) {
      this.addError(fieldName, `${fieldName} must be in the future`, 'INVALID_DATE_RANGE');
    }
    
    return this;
  }

  /**
   * Custom validation function
   */
  custom(value: unknown, validator: (val: unknown) => boolean, fieldName: string, message: string): this {
    if (!validator(value)) {
      this.addError(fieldName, message, 'CUSTOM_VALIDATION');
    }
    
    return this;
  }
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string, type: 'basic' | 'richText' | 'textOnly' = 'basic'): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return sanitizeHTML(input, type);
}

/**
 * Validate and sanitize form data
 */
export function validateFormData<T extends Record<string, unknown>>(
  data: T,
  schema: z.ZodSchema<T>
): { isValid: boolean; data?: T; errors?: Record<string, string> } {
  try {
    // First, sanitize string fields
    const sanitizedData = Object.entries(data).reduce((acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = sanitizeInput(value, 'basic');
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, unknown>) as T;

    // Then validate with schema
    const validData = schema.parse(sanitizedData);
    
    return {
      isValid: true,
      data: validData
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.reduce((acc: Record<string, string>, err) => {
        const field = err.path.join('.');
        acc[field] = err.message;
        return acc;
      }, {} as Record<string, string>);
      
      return {
        isValid: false,
        errors
      };
    }
    
    return {
      isValid: false,
      errors: { general: 'Validation failed' }
    };
  }
}

/**
 * Pre-defined validation schemas
 */
export const ValidationSchemas = {
  // User-related validations
  email: z.string().email('Invalid email format').max(INPUT_LIMITS.email),
  name: z.string().min(1, 'Name is required').max(INPUT_LIMITS.shortText),
  phone: z.string().regex(VALIDATION_PATTERNS.phone, 'Invalid phone format').optional(),
  
  // Dog-related validations
  dogName: z.string().min(1, 'Dog name is required').max(INPUT_LIMITS.shortText)
    .regex(VALIDATION_PATTERNS.safeString, 'Dog name contains invalid characters'),
  breed: z.string().min(1, 'Breed is required').max(INPUT_LIMITS.shortText),
  registrationNumber: z.string().max(INPUT_LIMITS.shortText).optional(),
  
  // Show-related validations
  showName: z.string().min(1, 'Show name is required').max(INPUT_LIMITS.mediumText)
    .regex(VALIDATION_PATTERNS.safeString, 'Show name contains invalid characters'),
  description: z.string().max(INPUT_LIMITS.longText).optional(),
  notes: z.string().max(INPUT_LIMITS.longText).optional(),
  
  // Common validations
  id: z.string().uuid('Invalid ID format'),
  positiveInteger: z.number().int().positive('Must be a positive number'),
  currency: z.number().min(0, 'Amount cannot be negative').multipleOf(0.01, 'Invalid currency amount'),
  date: z.string().datetime('Invalid date format'),
  url: z.string().url('Invalid URL format').max(INPUT_LIMITS.url).optional(),
  
  // Password validation
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(VALIDATION_PATTERNS.strongPassword, 
      'Password must contain uppercase, lowercase, number, and special character'),
  
  // File validation
  filename: z.string()
    .min(1, 'Filename is required')
    .max(INPUT_LIMITS.filename)
    .regex(VALIDATION_PATTERNS.noSpecialChars, 'Filename contains invalid characters')
} as const;

/**
 * Validate file upload
 */
export function validateFileUpload(
  file: File,
  allowedTypes: string[],
  maxSize: number
): { isValid: boolean; error?: string } {
  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: `File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
    };
  }
  
  // Check file size
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / 1024 / 1024);
    return {
      isValid: false,
      error: `File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds maximum allowed size (${maxMB}MB)`
    };
  }
  
  // Check filename
  const validator = new InputValidator();
  validator.safeString(file.name, 'filename');
  
  if (!validator.isValid()) {
    return {
      isValid: false,
      error: 'Filename contains invalid characters'
    };
  }
  
  return { isValid: true };
}

/**
 * Rate limiting helper
 */
class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  
  /**
   * Check if action is rate limited
   */
  isRateLimited(identifier: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];
    
    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(time => now - time < windowMs);
    
    if (recentAttempts.length >= maxAttempts) {
      return true;
    }
    
    // Add current attempt
    recentAttempts.push(now);
    this.attempts.set(identifier, recentAttempts);
    
    return false;
  }
  
  /**
   * Clear rate limit for identifier
   */
  clearRateLimit(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Security validation utilities
 */
export const SecurityValidation = {
  /**
   * Check for potential SQL injection patterns
   */
  hasSQLInjectionPattern(input: string): boolean {
    const patterns = [
      /('|(--|;)|(\|\|)|(\*\*))/i,
      /(union|select|insert|update|delete|drop|create|alter|exec|execute)/i,
      /(script|javascript|vbscript|onload|onerror|onclick)/i
    ];
    
    return patterns.some(pattern => pattern.test(input));
  },
  
  /**
   * Check for potential XSS patterns
   */
  hasXSSPattern(input: string): boolean {
    const patterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>/gi
    ];
    
    return patterns.some(pattern => pattern.test(input));
  },
  
  /**
   * Validate input is safe
   */
  isSafeInput(input: string): boolean {
    return !this.hasSQLInjectionPattern(input) && !this.hasXSSPattern(input);
  }
};

/**
 * Export convenience validator instance
 */
export const validator = new InputValidator();