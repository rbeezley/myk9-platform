import { z } from 'zod';

// Common field validations
export const commonValidations = {
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().regex(/^\+?[\d\s\-()]+$/, 'Please enter a valid phone number').optional().or(z.literal('')),
  required: z.string().min(1, 'This field is required'),
  optionalString: z.string().optional(),
  positiveNumber: z.number().positive('Must be a positive number'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please enter a valid date (YYYY-MM-DD)'),
  url: z.string()
    .optional()
    .or(z.literal(''))
    .transform((val) => {
      // If empty or not provided, return as is
      if (!val || val.trim() === '') return val;
      
      const trimmed = val.trim();
      
      // If it already has a protocol, validate as-is
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
          new URL(trimmed);
          return trimmed;
        } catch {
          throw new Error('Please enter a valid URL');
        }
      }
      
      // If it looks like a domain (contains a dot), prepend https://
      if (trimmed.includes('.') && !trimmed.includes(' ')) {
        const withProtocol = `https://${trimmed}`;
        try {
          new URL(withProtocol);
          return withProtocol;
        } catch {
          throw new Error('Please enter a valid website URL (e.g., example.com or https://example.com)');
        }
      }
      
      // Otherwise, it's not a valid URL format
      throw new Error('Please enter a valid website URL (e.g., example.com or https://example.com)');
    }),
};

// Dog validation schemas
export const dogSchemas = {
  basic: z.object({
    name: commonValidations.name,
    callName: commonValidations.optionalString,
    breed: commonValidations.required,
    gender: z.enum(['Male', 'Female'], { message: 'Please select a gender' }),
    dateOfBirth: commonValidations.date.optional(),
    color: commonValidations.optionalString,
    weight: commonValidations.optionalString,
    height: commonValidations.optionalString,
    microchip: commonValidations.optionalString,
    description: commonValidations.optionalString,
  }),
  
  registration: z.object({
    organization: commonValidations.required,
    registeredName: commonValidations.name,
    breed: commonValidations.required,
    variety: commonValidations.optionalString,
    registrationNumber: commonValidations.optionalString,
    applicationNumber: commonValidations.optionalString,
    submissionDate: commonValidations.date.optional(),
    registrationDate: commonValidations.date.optional(),
  }),

  health: z.object({
    type: z.enum(['vaccination', 'medication', 'allergy', 'vet-visit'], {
      message: 'Please select a health record type'
    }),
    name: commonValidations.required,
    date: commonValidations.date,
    vetName: commonValidations.optionalString,
    notes: commonValidations.optionalString,
    expiration: commonValidations.date.optional(),
  }),
};

// User validation schemas
export const personSchemas = {
  basic: z.object({
    firstName: commonValidations.name,
    lastName: commonValidations.name,
    email: commonValidations.email.optional().or(z.literal('')),
    phone: commonValidations.phone,
    streetAddress: commonValidations.optionalString,
    city: commonValidations.optionalString,
    state: commonValidations.optionalString,
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Please enter a valid ZIP code').optional().or(z.literal('')),
  }),
};

// Show validation schemas
export const showSchemas = {
  basic: z.object({
    name: commonValidations.name,
    type: z.enum(['Specialty', 'All-Breed', 'Fun Match', 'Sanctioned Match'], {
      message: 'Please select a show type'
    }),
    startDate: commonValidations.date,
    endDate: commonValidations.date,
    location: commonValidations.required,
    entryOpenDate: commonValidations.date.optional(),
    entryCloseDate: commonValidations.date.optional(),
    preEntryFee: z.string().regex(/^\$?\d+(\.\d{2})?$/, 'Please enter a valid fee amount').optional().or(z.literal('')),
    chairman: commonValidations.optionalString,
    secretary: commonValidations.optionalString,
    chiefSteward: commonValidations.optionalString,
  }).refine((data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  }, {
    message: 'End date must be after start date',
    path: ['endDate'],
  }),

  trial: z.object({
    name: commonValidations.name,
    date: commonValidations.date,
    trialNumber: commonValidations.optionalString,
    judge: commonValidations.optionalString,
  }),
};

// Club validation schemas
export const clubSchemas = {
  basic: z.object({
    name: commonValidations.name,
    clubNumber: commonValidations.optionalString,
    email: commonValidations.email,
    phone: z.string().min(1, 'Phone number is required').regex(/^\+?[\d\s\-()]+$/, 'Please enter a valid phone number'),
    website: commonValidations.url,
    description: commonValidations.optionalString,
    logo: commonValidations.optionalString,
    
    // Address fields - all required
    street: z.string().min(1, 'Street address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State/Province is required'),
    zipCode: z.string().min(1, 'ZIP/Postal code is required').regex(/^[A-Z0-9\s-]{3,10}$/i, 'Please enter a valid postal/ZIP code'),
    country: z.string().min(2, 'Please select a country').max(3, 'Invalid country code'),
    
    // Additional fields
    founded: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please enter a valid date (YYYY-MM-DD)').optional().or(z.literal('')),
    clubType: z.enum(['specialty', 'all-breed', 'local', 'regional', 'national'], {
      message: 'Please select a club type'
    }).optional().or(z.literal('')),
  }),
};

// Export types for TypeScript
export type DogBasicInput = z.infer<typeof dogSchemas.basic>;
export type DogRegistrationInput = z.infer<typeof dogSchemas.registration>;
export type DogHealthInput = z.infer<typeof dogSchemas.health>;
export type PersonBasicInput = z.infer<typeof personSchemas.basic>;
export type ShowBasicInput = z.infer<typeof showSchemas.basic>;
export type ShowTrialInput = z.infer<typeof showSchemas.trial>;
export type ClubBasicInput = z.infer<typeof clubSchemas.basic>;

// Validation helper function
export function validateField<T>(schema: z.ZodSchema<T>, field: string, value: unknown): string | null {
  try {
    schema.parse({ [field]: value });
    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldError = error.issues.find(err => err.path.includes(field));
      return fieldError?.message || null;
    }
    return null;
  }
}

// Validation helper for entire objects
export function validateForm<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  errors: Record<string, string>;
  data?: T;
} {
  try {
    const validData = schema.parse(data);
    return {
      success: true,
      errors: {},
      data: validData,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err) => {
        if (err.path.length > 0) {
          errors[err.path[0] as string] = err.message;
        }
      });
      return {
        success: false,
        errors,
      };
    }
    return {
      success: false,
      errors: { general: 'Validation failed' },
    };
  }
}