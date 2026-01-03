// Data validation and consistency checks
// Phase 3.3: Enhanced Error Handling & Recovery

import { z } from 'zod';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryClient';

// Enhanced validation schemas with detailed error messages
export const ValidationSchemas = {
  // Dog validation schema
  dog: z.object({
    id: z.string().uuid('Invalid dog ID format').optional(),
    name: z.string()
      .min(1, 'Dog name is required')
      .max(50, 'Dog name must be 50 characters or less')
      .regex(/^[a-zA-Z\s'-]+$/, 'Dog name can only contain letters, spaces, hyphens, and apostrophes'),
    breed: z.string()
      .min(1, 'Breed is required')
      .max(100, 'Breed name must be 100 characters or less'),
    registration_number: z.string()
      .optional()
      .refine((val) => !val || /^[A-Z0-9-]+$/.test(val), 'Registration number can only contain uppercase letters, numbers, and hyphens'),
    date_of_birth: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .refine((date) => {
        const birthDate = new Date(date);
        const today = new Date();
        const maxAge = new Date();
        maxAge.setFullYear(today.getFullYear() - 25); // Dogs typically don't live beyond 25 years
        
        return birthDate <= today && birthDate >= maxAge;
      }, 'Date of birth must be valid and within reasonable range'),
    gender: z.enum(['male', 'female'], { errorMap: () => ({ message: 'Gender must be either male or female' }) }),
    color: z.string()
      .min(1, 'Color is required')
      .max(50, 'Color must be 50 characters or less'),
    weight: z.number()
      .positive('Weight must be positive')
      .max(200, 'Weight must be reasonable (under 200 lbs)')
      .optional(),
    height: z.number()
      .positive('Height must be positive')
      .max(50, 'Height must be reasonable (under 50 inches)')
      .optional(),
    owner_id: z.string().uuid('Invalid owner ID format'),
    microchip_number: z.string()
      .optional()
      .refine((val) => !val || /^[0-9A-F]{15}$/.test(val), 'Microchip number must be 15 hexadecimal characters'),
    is_active: z.boolean().default(true),
    notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional(),
  }),

  // User validation schema
  user: z.object({
    id: z.string().uuid('Invalid user ID format').optional(),
    first_name: z.string()
      .min(1, 'First name is required')
      .max(50, 'First name must be 50 characters or less')
      .regex(/^[a-zA-Z\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes'),
    last_name: z.string()
      .min(1, 'Last name is required')
      .max(50, 'Last name must be 50 characters or less')
      .regex(/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes'),
    email: z.string()
      .email('Invalid email format')
      .max(100, 'Email must be 100 characters or less'),
    phone: z.string()
      .optional()
      .refine((val) => !val || /^\+?[\d\s\-()]+$/.test(val), 'Invalid phone number format'),
    address: z.string().max(200, 'Address must be 200 characters or less').optional(),
    city: z.string().max(100, 'City must be 100 characters or less').optional(),
    state: z.string()
      .optional()
      .refine((val) => !val || /^[A-Z]{2}$/.test(val), 'State must be 2-letter abbreviation'),
    zip_code: z.string()
      .optional()
      .refine((val) => !val || /^\d{5}(-\d{4})?$/.test(val), 'Invalid ZIP code format'),
    date_of_birth: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .refine((date) => {
        const birthDate = new Date(date);
        const today = new Date();
        const minAge = new Date();
        minAge.setFullYear(today.getFullYear() - 13); // Minimum age 13
        const maxAge = new Date();
        maxAge.setFullYear(today.getFullYear() - 120); // Maximum age 120
        
        return birthDate <= minAge && birthDate >= maxAge;
      }, 'Date of birth must be valid (minimum age 13)'),
    role: z.enum(['admin', 'secretary', 'exhibitor', 'judge', 'viewer'], {
      errorMap: () => ({ message: 'Invalid role selected' })
    }),
    is_active: z.boolean().default(true),
    emergency_contact_name: z.string().max(100, 'Emergency contact name must be 100 characters or less').optional(),
    emergency_contact_phone: z.string()
      .optional()
      .refine((val) => !val || /^\+?[\d\s\-()]+$/.test(val), 'Invalid emergency contact phone format'),
  }),

  // Show validation schema
  show: z.object({
    id: z.string().uuid('Invalid show ID format').optional(),
    name: z.string()
      .min(1, 'Show name is required')
      .max(100, 'Show name must be 100 characters or less'),
    date: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .refine((date) => {
        const showDate = new Date(date);
        const today = new Date();
        const maxFuture = new Date();
        maxFuture.setFullYear(today.getFullYear() + 2); // Maximum 2 years in future
        
        return showDate >= today && showDate <= maxFuture;
      }, 'Show date must be in the future but within 2 years'),
    location: z.string()
      .min(1, 'Location is required')
      .max(200, 'Location must be 200 characters or less'),
    club_id: z.string().uuid('Invalid club ID format'),
    entry_deadline: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Entry deadline must be in YYYY-MM-DD format')
      .optional(),
    entry_fee: z.number()
      .nonnegative('Entry fee cannot be negative')
      .max(1000, 'Entry fee must be reasonable (under $1000)')
      .optional(),
    max_entries: z.number()
      .positive('Maximum entries must be positive')
      .max(10000, 'Maximum entries must be reasonable')
      .optional(),
    status: z.enum(['draft', 'open', 'closed', 'cancelled', 'completed'], {
      errorMap: () => ({ message: 'Invalid show status' })
    }),
    type: z.enum(['conformation', 'obedience', 'agility', 'rally', 'tracking', 'mixed'], {
      errorMap: () => ({ message: 'Invalid show type' })
    }),
    sanctioning_organization: z.string()
      .min(1, 'Sanctioning organization is required')
      .max(50, 'Sanctioning organization must be 50 characters or less'),
    premium_deadline: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Premium deadline must be in YYYY-MM-DD format')
      .optional(),
    notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional(),
  }),

  // Club validation schema
  club: z.object({
    id: z.string().uuid('Invalid club ID format').optional(),
    name: z.string()
      .min(1, 'Club name is required')
      .max(100, 'Club name must be 100 characters or less'),
    address: z.string().max(200, 'Address must be 200 characters or less').optional(),
    city: z.string().max(100, 'City must be 100 characters or less').optional(),
    state: z.string()
      .optional()
      .refine((val) => !val || /^[A-Z]{2}$/.test(val), 'State must be 2-letter abbreviation'),
    zip_code: z.string()
      .optional()
      .refine((val) => !val || /^\d{5}(-\d{4})?$/.test(val), 'Invalid ZIP code format'),
    phone: z.string()
      .optional()
      .refine((val) => !val || /^\+?[\d\s\-()]+$/.test(val), 'Invalid phone number format'),
    email: z.string()
      .email('Invalid email format')
      .max(100, 'Email must be 100 characters or less')
      .optional(),
    website: z.string()
      .url('Invalid website URL')
      .max(200, 'Website URL must be 200 characters or less')
      .optional(),
    is_active: z.boolean().default(true),
    founded_year: z.number()
      .int('Founded year must be a whole number')
      .min(1800, 'Founded year must be 1800 or later')
      .max(new Date().getFullYear(), 'Founded year cannot be in the future')
      .optional(),
  }),
};

// Data consistency checker
export class DataConsistencyChecker {
  private queryClient: QueryClient;

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
  }

  // Check dog-owner relationship consistency
  async checkDogOwnerConsistency(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      const dogs = this.queryClient.getQueryData(queryKeys.dogs) as Array<{ id: string; owner_id: string; name: string }> || [];
      const users = this.queryClient.getQueryData(queryKeys.users.all) as Array<{ id: string; first_name: string; last_name: string }> || [];
      
      const userIds = new Set(users.map(u => u.id));
      
      // Check for dogs with invalid owner references
      const orphanedDogs = dogs.filter(dog => !userIds.has(dog.owner_id));
      orphanedDogs.forEach(dog => {
        issues.push(`Dog "${dog.name}" (${dog.id}) references non-existent owner ${dog.owner_id}`);
      });
      
      // Check for duplicate dog names within same owner
      const dogsByOwner = dogs.reduce((acc, dog) => {
        if (!acc[dog.owner_id]) acc[dog.owner_id] = [];
        acc[dog.owner_id].push(dog);
        return acc;
      }, {} as Record<string, typeof dogs>);
      
      Object.entries(dogsByOwner).forEach(([ownerId, ownerDogs]) => {
        const nameCount = ownerDogs.reduce((acc, dog) => {
          acc[dog.name] = (acc[dog.name] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        Object.entries(nameCount).forEach(([name, count]) => {
          if (count > 1) {
            const owner = users.find(u => u.id === ownerId);
            const ownerName = owner ? `${owner.first_name} ${owner.last_name}` : 'Unknown Owner';
            issues.push(`Owner "${ownerName}" has ${count} dogs named "${name}"`);
          }
        });
      });
      
    } catch (error) {
      issues.push(`Failed to check dog-owner consistency: ${error}`);
    }
    
    return { valid: issues.length === 0, issues };
  }

  // Check show-club relationship consistency
  async checkShowClubConsistency(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      const shows = this.queryClient.getQueryData(queryKeys.shows) as Array<{ id: string; club_id: string; name: string; date: string }> || [];
      const clubs = this.queryClient.getQueryData(queryKeys.clubs) as Array<{ id: string; name: string; is_active: boolean }> || [];
      
      const activeClubIds = new Set(clubs.filter(c => c.is_active).map(c => c.id));
      const allClubIds = new Set(clubs.map(c => c.id));
      
      // Check for shows with invalid club references
      const orphanedShows = shows.filter(show => !allClubIds.has(show.club_id));
      orphanedShows.forEach(show => {
        issues.push(`Show "${show.name}" (${show.date}) references non-existent club ${show.club_id}`);
      });
      
      // Check for shows with inactive clubs
      const inactiveClubShows = shows.filter(show => !activeClubIds.has(show.club_id) && allClubIds.has(show.club_id));
      inactiveClubShows.forEach(show => {
        const club = clubs.find(c => c.id === show.club_id);
        issues.push(`Show "${show.name}" (${show.date}) is hosted by inactive club "${club?.name}"`);
      });
      
    } catch (error) {
      issues.push(`Failed to check show-club consistency: ${error}`);
    }
    
    return { valid: issues.length === 0, issues };
  }

  // Check registration number uniqueness
  async checkRegistrationUniqueness(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      const dogs = this.queryClient.getQueryData(queryKeys.dogs) as Array<{ id: string; registration_number?: string; name: string }> || [];
      
      const registrationNumbers = dogs
        .filter(dog => dog.registration_number)
        .reduce((acc, dog) => {
          const regNum = dog.registration_number!;
          if (!acc[regNum]) acc[regNum] = [];
          acc[regNum].push(dog);
          return acc;
        }, {} as Record<string, typeof dogs>);
      
      Object.entries(registrationNumbers).forEach(([regNum, dogsWithSameReg]) => {
        if (dogsWithSameReg.length > 1) {
          const dogNames = dogsWithSameReg.map(d => d.name).join(', ');
          issues.push(`Registration number "${regNum}" is used by multiple dogs: ${dogNames}`);
        }
      });
      
    } catch (error) {
      issues.push(`Failed to check registration uniqueness: ${error}`);
    }
    
    return { valid: issues.length === 0, issues };
  }

  // Check email uniqueness
  async checkEmailUniqueness(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      const users = this.queryClient.getQueryData(queryKeys.users.all) as Array<{ id: string; email: string; first_name: string; last_name: string }> || [];
      
      const emailCount = users.reduce((acc, user) => {
        acc[user.email.toLowerCase()] = (acc[user.email.toLowerCase()] || []);
        acc[user.email.toLowerCase()].push(user);
        return acc;
      }, {} as Record<string, typeof users>);
      
      Object.entries(emailCount).forEach(([email, usersWithSameEmail]) => {
        if (usersWithSameEmail.length > 1) {
          const userNames = usersWithSameEmail.map(u => `${u.first_name} ${u.last_name}`).join(', ');
          issues.push(`Email "${email}" is used by multiple users: ${userNames}`);
        }
      });
      
    } catch (error) {
      issues.push(`Failed to check email uniqueness: ${error}`);
    }
    
    return { valid: issues.length === 0, issues };
  }

  // Check date consistency (entry deadlines before show dates, etc.)
  async checkDateConsistency(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      const shows = this.queryClient.getQueryData(queryKeys.shows) as Array<{ 
        id: string; 
        name: string; 
        date: string; 
        entry_deadline?: string;
        premium_deadline?: string;
      }> || [];
      
      shows.forEach(show => {
        const showDate = new Date(show.date);
        
        // Check entry deadline
        if (show.entry_deadline) {
          const entryDeadline = new Date(show.entry_deadline);
          if (entryDeadline >= showDate) {
            issues.push(`Show "${show.name}": Entry deadline (${show.entry_deadline}) must be before show date (${show.date})`);
          }
        }
        
        // Check premium deadline
        if (show.premium_deadline) {
          const premiumDeadline = new Date(show.premium_deadline);
          if (premiumDeadline >= showDate) {
            issues.push(`Show "${show.name}": Premium deadline (${show.premium_deadline}) must be before show date (${show.date})`);
          }
          
          // Premium deadline should be before entry deadline
          if (show.entry_deadline) {
            const entryDeadline = new Date(show.entry_deadline);
            if (premiumDeadline >= entryDeadline) {
              issues.push(`Show "${show.name}": Premium deadline (${show.premium_deadline}) should be before entry deadline (${show.entry_deadline})`);
            }
          }
        }
      });
      
    } catch (error) {
      issues.push(`Failed to check date consistency: ${error}`);
    }
    
    return { valid: issues.length === 0, issues };
  }

  // Run comprehensive data consistency check
  async runFullConsistencyCheck(): Promise<{
    valid: boolean;
    checks: {
      dogOwnerConsistency: { valid: boolean; issues: string[] };
      showClubConsistency: { valid: boolean; issues: string[] };
      registrationUniqueness: { valid: boolean; issues: string[] };
      emailUniqueness: { valid: boolean; issues: string[] };
      dateConsistency: { valid: boolean; issues: string[] };
    };
    totalIssues: number;
  }> {
    const checks = {
      dogOwnerConsistency: await this.checkDogOwnerConsistency(),
      showClubConsistency: await this.checkShowClubConsistency(),
      registrationUniqueness: await this.checkRegistrationUniqueness(),
      emailUniqueness: await this.checkEmailUniqueness(),
      dateConsistency: await this.checkDateConsistency(),
    };
    
    const totalIssues = Object.values(checks).reduce((sum, check) => sum + check.issues.length, 0);
    const valid = totalIssues === 0;
    
    return { valid, checks, totalIssues };
  }
}

// Validation utilities
export const ValidationUtils = {
  // Validate data against schema
  validateData: <T>(schema: z.ZodSchema<T>, data: unknown): { success: boolean; data?: T; errors?: string[] } => {
    try {
      const result = schema.safeParse(data);
      
      if (result.success) {
        return { success: true, data: result.data };
      } else {
        const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        return { success: false, errors };
      }
    } catch (error) {
      return { success: false, errors: [`Validation failed: ${error}`] };
    }
  },

  // Sanitize data before validation
  sanitizeData: (data: Record<string, unknown>): Record<string, unknown> => {
    const sanitized = { ...data };
    
    // Trim string values
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = (sanitized[key] as string).trim();
      }
    });
    
    // Remove empty strings and convert to undefined
    Object.keys(sanitized).forEach(key => {
      if (sanitized[key] === '') {
        sanitized[key] = undefined;
      }
    });
    
    return sanitized;
  },

  // Format validation errors for display
  formatValidationErrors: (errors: string[]): string => {
    if (errors.length === 0) return '';
    if (errors.length === 1) return errors[0];
    
    return `Multiple validation errors:\n${errors.map(err => `• ${err}`).join('\n')}`;
  },
};

// Hook for data validation
export const useDataValidation = () => {
  const queryClient = useQueryClient();
  const consistencyChecker = new DataConsistencyChecker(queryClient);
  
  const validateEntity = (entityType: keyof typeof ValidationSchemas, data: unknown) => {
    const schema = ValidationSchemas[entityType];
    const sanitizedData = ValidationUtils.sanitizeData(data as Record<string, unknown>);
    return ValidationUtils.validateData(schema as z.ZodSchema<unknown>, sanitizedData);
  };
  
  return {
    validateEntity,
    validateDog: (data: unknown) => validateEntity('dog', data),
    validateUser: (data: unknown) => validateEntity('user', data),
    validateShow: (data: unknown) => validateEntity('show', data),
    validateClub: (data: unknown) => validateEntity('club', data),
    
    // Consistency checks
    checkConsistency: consistencyChecker.runFullConsistencyCheck.bind(consistencyChecker),
    checkDogOwnerConsistency: consistencyChecker.checkDogOwnerConsistency.bind(consistencyChecker),
    checkShowClubConsistency: consistencyChecker.checkShowClubConsistency.bind(consistencyChecker),
    checkRegistrationUniqueness: consistencyChecker.checkRegistrationUniqueness.bind(consistencyChecker),
    checkEmailUniqueness: consistencyChecker.checkEmailUniqueness.bind(consistencyChecker),
    checkDateConsistency: consistencyChecker.checkDateConsistency.bind(consistencyChecker),
    
    // Utilities
    sanitizeData: ValidationUtils.sanitizeData,
    formatErrors: ValidationUtils.formatValidationErrors,
  };
};