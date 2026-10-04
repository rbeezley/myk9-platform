import { z } from 'zod';
import { canonicalizeWebsiteUrl } from './websiteUrl';

export interface NormalizedWebsiteUrl {
  /** The trimmed input, or `https://`-prefixed when a bare domain normalized cleanly. */
  value: string;
  /** False when `value` is still not a valid URL after normalizing. */
  valid: boolean;
}

/**
 * Normalizes a website URL for saving: prepends `https://` to a bare domain
 * and returns the CANONICAL URL (`canonicalizeWebsiteUrl`), so what is stored
 * is exactly what gets linked. Rejects non-http(s) schemes and credentials
 * (userinfo can spoof the displayed domain). Empty input is valid and empty.
 */
// Only http(s) values get the "malformed URL" message; anything else (a bare
// word, another scheme, embedded credentials) gets the bare-domain hint.
const HAS_HTTP_SCHEME = /^https?:\/\//i;

export function normalizeWebsiteUrl(value: string | null | undefined): NormalizedWebsiteUrl {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { value: '', valid: true };

  const canonical = canonicalizeWebsiteUrl(trimmed);
  return canonical ? { value: canonical, valid: true } : { value: trimmed, valid: false };
}

// Common field validations
export const commonValidations = {
  name: z.string().min(1, 'Please enter a name').max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Please enter a valid email address'),
  emailRequired: z
    .string()
    .min(1, 'Please enter an email address')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-()]+$/, 'Please enter a valid phone number')
    .optional()
    .or(z.literal('')),
  required: z.string().min(1, 'Please fill in this field'),
  optionalString: z.string().optional(),
  positiveNumber: z.number().positive('Please enter a positive number'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please enter a valid date (YYYY-MM-DD)'),
  url: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform(val => {
      if (!val || val.trim() === '') return val;

      const result = normalizeWebsiteUrl(val);
      if (!result.valid) {
        const trimmed = val.trim();
        if (HAS_HTTP_SCHEME.test(trimmed)) {
          throw new Error('Please enter a valid URL');
        }
        throw new Error(
          'Please enter a valid website URL (e.g., example.com or https://example.com)'
        );
      }
      return result.value;
    }),
};

// Dog validation schemas
export const dogSchemas = {
  basic: z.object({
    name: commonValidations.name,
    callName: commonValidations.optionalString,
    breed: commonValidations.required,
    gender: z.enum(['Male', 'Female'], { message: 'Please select a sex' }),
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
    registrationNumber: commonValidations.required,
    applicationNumber: commonValidations.optionalString,
    submissionDate: commonValidations.date.optional(),
    registrationDate: commonValidations.date.optional(),
  }),

  health: z.object({
    type: z.enum(['vaccination', 'medication', 'allergy', 'vet-visit'], {
      message: 'Please select a health record type',
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
    zipCode: z
      .string()
      .regex(/^\d{5}(-\d{4})?$/, 'Please enter a valid ZIP code')
      .optional()
      .or(z.literal('')),
  }),
};

// Show validation schemas
export const showSchemas = {
  basic: z
    .object({
      name: commonValidations.name,
      type: z.enum(['Specialty', 'All-Breed', 'Fun Match', 'Sanctioned Match'], {
        message: 'Please select a show type',
      }),
      startDate: commonValidations.date,
      endDate: commonValidations.date,
      location: commonValidations.required,
      entryOpenDate: commonValidations.date.optional(),
      entryCloseDate: commonValidations.date.optional(),
      preEntryFee: z
        .string()
        .regex(/^\$?\d+(\.\d{2})?$/, 'Please enter a valid fee amount')
        .optional()
        .or(z.literal('')),
    })
    .refine(
      data => {
        if (data.startDate && data.endDate) {
          return new Date(data.startDate) <= new Date(data.endDate);
        }
        return true;
      },
      {
        message: 'End date must be after start date',
        path: ['endDate'],
      }
    ),

  /** Zod schema for ShowEditPanel (ShowEditFormData). */
  edit: z
    .object({
      name: z.string().min(1, 'Please enter a show name'),
      status: z.string(),
      organization: z.string(),
      clubId: z.string().min(1, 'Please select a hosting club'),
      startDate: z.string().min(1, 'Please select a start date'),
      endDate: z.string().min(1, 'Please select an end date'),
      location: z.string(),
      // Optional staffing fields — not always present in ShowEditFormData
      chairman: z.string().optional().default(''),
      secretary: z.string().optional().default(''),
      chiefSteward: z.string().optional().default(''),
      entryOpenDate: z.string(),
      entryCloseDate: z.string(),
      preEntryFee: z.string().refine(
        val => {
          if (!val) return true;
          return !isNaN(parseFloat(val.replace(/[$,]/g, '')));
        },
        { message: 'Please enter a valid pre-entry fee amount' }
      ),
      dayOfShowFee: z.string().refine(
        val => {
          if (!val) return true;
          return !isNaN(parseFloat(val.replace(/[$,]/g, '')));
        },
        { message: 'Please enter a valid day of show fee amount' }
      ),
      juniorHandlerFee: z
        .string()
        .trim()
        .refine(val => val === '' || (/^\d+(?:\.\d{1,2})?$/.test(val) && Number(val) < 100_000), {
          message: 'Please enter a valid junior handler fee amount',
        })
        .optional(),
      assignedJudges: z.custom<import('@/types/judge-types').ShowJudgeAssignment[]>(
        val => Array.isArray(val),
        { message: 'Invalid judge assignments' }
      ),
      startingArmbandNumber: z.number().int().min(1).optional(),
      maxEntriesPerDog: z.number().optional(),
      maxTotalEntries: z.number().optional(),
      allowNonOwnerHandlers: z.boolean().optional(),
      isNationals: z.boolean().optional(),
      acceptCheckPayments: z.boolean().optional(),
      acceptCashPayments: z.boolean().optional(),
      style: z.string().default('monogram'),
      publishExperience: z.boolean().optional(),
      generatedPremium: z.custom<import('@/types/premium-types').GeneratedPremium>().optional(),
      inkSaver: z.boolean().optional(),
    })
    .refine(
      data => {
        if (data.startDate && data.endDate) {
          return new Date(data.endDate) >= new Date(data.startDate);
        }
        return true;
      },
      {
        message: 'End date must be after start date',
        path: ['endDate'],
      }
    )
    .refine(
      data => {
        if (data.entryOpenDate && data.entryCloseDate) {
          return new Date(data.entryCloseDate) >= new Date(data.entryOpenDate);
        }
        return true;
      },
      {
        message: 'Entry close date must be after entry open date',
        path: ['entryCloseDate'],
      }
    )
    .refine(
      data => {
        if (data.entryCloseDate && data.startDate) {
          return new Date(data.entryCloseDate) <= new Date(data.startDate);
        }
        return true;
      },
      {
        message: 'Entry close date must be before show start date',
        path: ['entryCloseDate'],
      }
    )
    .refine(data => !data.publishExperience || Boolean(data.generatedPremium), {
      message: 'Wait for shared show content to finish before publishing to exhibitors',
      path: ['generatedPremium'],
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
    phone: z
      .string()
      .min(1, 'Please enter a phone number')
      .regex(/^\+?[\d\s\-()]+$/, 'Please enter a valid phone number'),
    website: commonValidations.url,
    description: commonValidations.optionalString,
    logo: commonValidations.optionalString,

    // Address fields - all required
    street: z.string().min(1, 'Please enter a street address'),
    city: z.string().min(1, 'Please enter a city'),
    state: z.string().min(1, 'Please select a state/province'),
    zipCode: z
      .string()
      .min(1, 'Please enter a ZIP/postal code')
      .regex(/^[A-Z0-9\s-]{3,10}$/i, 'Please enter a valid postal/ZIP code'),
    country: z.string().min(2, 'Please select a country').max(3, 'Invalid country code'),

    // Additional fields
    founded: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please enter a valid date (YYYY-MM-DD)')
      .optional()
      .or(z.literal('')),
    clubType: z
      .enum(['specialty', 'all-breed', 'local', 'regional', 'national'], {
        message: 'Please select a club type',
      })
      .optional()
      .or(z.literal('')),
    accentColor: commonValidations.optionalString,
  }),
};

// Zod helper: string that allows empty but never undefined (for required string fields with no min-length)
const requiredString = z.string();

// Zod helper: time-limit field — optional string, must parse as int if non-empty
const timeLimitField = (label: string) =>
  z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(v => !v || !isNaN(parseInt(v)), { message: `Please enter a valid ${label}` });

// Class validation schemas
export const classSchemas = {
  /** Full mode — ClassData editing (element/level read-only but required) */
  full: z.object({
    element: z.string().min(1, 'Please enter an element'),
    level: z.string().min(1, 'Please enter a level'),
    section: requiredString,
    classOrder: requiredString,
    status: z.string().min(1, 'Please select a status'),
    estimatedJudgingTime: commonValidations.optionalString,
    timeLimit1: timeLimitField('time limit 1'),
    timeLimit2: timeLimitField('time limit 2'),
    timeLimit3: timeLimitField('time limit 3'),
    judge: commonValidations.optionalString,
    judgeId: commonValidations.optionalString,
    gateSteward: commonValidations.optionalString,
    tableSteward: commonValidations.optionalString,
    timerSteward: commonValidations.optionalString,
    ringSteward1: commonValidations.optionalString,
    ringSteward2: commonValidations.optionalString,
    ringSteward3: commonValidations.optionalString,
    hidesUsed: commonValidations.optionalString,
    distractionsUsed: commonValidations.optionalString,
    itemsUsed: commonValidations.optionalString,
    /** Blank (null) means no class limit. */
    maxEntries: z
      .number()
      .int('Enter a whole number, or leave blank for no limit')
      .min(1, 'The entry limit must be at least 1, or leave blank for no limit')
      .nullable()
      .optional(),
    allowsWaitlist: z.boolean().optional(),
    editedCapacity: z.array(z.enum(['maxEntries', 'allowsWaitlist'])).optional(),
    preEntryFee: z
      .number()
      .min(0, 'Please enter a valid pre-entry fee')
      .optional()
      .or(z.literal(0)),
    dayOfShowFee: z
      .number()
      .min(0, 'Please enter a valid day of show fee')
      .optional()
      .or(z.literal(0)),
  }),

  /** Simple mode — TrialClass editing */
  simple: z.object({
    element: requiredString,
    level: requiredString,
    section: requiredString,
    judgeId: commonValidations.optionalString,
    judgeName: commonValidations.optionalString,
    status: z.string().min(1, 'Please select a status'),
    entries: z.number(),
    maxEntries: z
      .number()
      .int('Enter a whole number, or leave blank for no limit')
      .min(1, 'The entry limit must be at least 1, or leave blank for no limit')
      .nullable()
      .optional(),
    allowsWaitlist: z.boolean().optional(),
    editedCapacity: z.array(z.enum(['maxEntries', 'allowsWaitlist'])).optional(),
  }),
};

// Shared registration form fields used by Add/Edit registration panels
export const registrationFormFields = {
  organization: z.string().min(1, 'Please select an organization'),
  registeredName: z.string().min(1, 'Please enter a registered name'),
  breed: z.string().min(1, 'Please enter a breed'),
  variety: z.string(),
  registrationNumber: z.string().min(1, 'Please enter a registration number'),
  status: z.string().min(1, 'Please select a status'),
  registrationDate: z.string(),
};

// Export types for TypeScript
export type DogBasicInput = z.infer<typeof dogSchemas.basic>;
export type DogRegistrationInput = z.infer<typeof dogSchemas.registration>;
export type DogHealthInput = z.infer<typeof dogSchemas.health>;
export type PersonBasicInput = z.infer<typeof personSchemas.basic>;
export type ShowBasicInput = z.infer<typeof showSchemas.basic>;
export type ShowEditInput = z.infer<typeof showSchemas.edit>;
export type ShowTrialInput = z.infer<typeof showSchemas.trial>;
export type ClubBasicInput = z.infer<typeof clubSchemas.basic>;
export type ClassFullInput = z.infer<typeof classSchemas.full>;
export type ClassSimpleInput = z.infer<typeof classSchemas.simple>;

// Validation helper function
export function validateField<T>(
  schema: z.ZodSchema<T>,
  field: string,
  value: unknown
): string | null {
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
export function validateForm<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): {
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
      error.issues.forEach(err => {
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
