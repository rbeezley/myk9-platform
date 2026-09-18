import { z } from 'zod';
import type { User as UserType, UserRole, JudgeQualification } from '@/types/user-types';
import { logger } from '@/services/LoggingService';
import type { UserFormData } from './UserEditPanel.types';
import { normalizeJuniorHandlerNumbers } from '@/features/registries/juniorHandlerPolicy';

/**
 * MYK9-570. A date of birth is optional, but a present one must be a real past
 * calendar date: the migration's CHECK refuses anything before 1900, and a date
 * in the future would make every junior derivation negative. Validated here so
 * the secretary sees a sentence rather than a Postgres constraint error.
 */
const dateOfBirthSchema = z.string().refine(value => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900) return false;
  return parsed.getTime() <= Date.now();
}, 'Please enter a date of birth in the past');

// Zod schema for judge qualification entries
const judgeQualificationSchema = z.object({
  organization: z.enum(['AKC', 'UKC', 'FCI', 'NACSW', 'CPE', 'OTHER', 'Other']),
  level: z.string(),
  disciplines: z.array(z.string()),
  dateObtained: z.union([z.date(), z.null()]),
  expirationDate: z.union([z.date(), z.null()]),
  judgeNumber: z.string().min(1, 'Judge number is required'),
  showTypes: z.array(z.string()),
  certificationDate: z.string().min(1, 'Certification date is required'),
  status: z.enum(['Active', 'Suspended', 'Expired']),
});

// Zod schema for UserFormData
export const userFormSchema: z.ZodSchema<UserFormData> = z
  .object({
    firstName: z
      .string()
      .min(1, 'Please enter a first name')
      .refine(v => v.trim().length > 0, 'Please enter a first name'),
    lastName: z
      .string()
      .min(1, 'Please enter a last name')
      .refine(v => v.trim().length > 0, 'Please enter a last name'),
    email: z
      .string()
      .min(1, 'Please enter an email address')
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'),
    phone: z
      .string()
      .refine(v => !v || /^[\d\s\-().+]+$/.test(v.trim()), 'Please enter a valid phone number'),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    dateOfBirth: dateOfBirthSchema,
    juniorHandlerNumberAKC: z.string(),
    juniorHandlerNumberUKC: z.string(),
    profileImage: z.string().optional(),
    judgeQualifications: z.array(judgeQualificationSchema),
    roles: z.array(z.string()),
    bio: z.string().optional(),
    website: z.string().optional(),
    emergencyContact: z.string().optional(),
    emergencyPhone: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Conditional address validation: if any address field is filled, city and state are required
    const hasAddressInfo =
      data.address?.trim() || data.city?.trim() || data.state?.trim() || data.zipCode?.trim();

    if (hasAddressInfo) {
      if (!data.city?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a city when providing address information',
          path: ['city'],
        });
      }
      if (!data.state?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a state when providing address information',
          path: ['state'],
        });
      }
    }
  }) as z.ZodSchema<UserFormData>;

// Convert UserType to form data
export const userToFormData = (user: Partial<UserType>): UserFormData => {
  // Handle both camelCase and snake_case field names for compatibility
  const userRecord = user as Record<string, unknown>;

  const result = {
    firstName: user.firstName || (userRecord.first_name as string) || '',
    lastName: user.lastName || (userRecord.last_name as string) || '',
    email: user.email || '',
    phone: user.phone || '',
    address: user.address || (userRecord.street_address as string) || '',
    city: user.city || '',
    state: user.state || '',
    zipCode: user.zipCode || (userRecord.zip_code as string) || '',
    // MYK9-570. Accept the snake_case row shape too — this panel is fed both a
    // mapped `User` and, on some callers, a raw people row.
    dateOfBirth: user.dateOfBirth || (userRecord.date_of_birth as string) || '',
    juniorHandlerNumberAKC:
      normalizeJuniorHandlerNumbers(user.juniorHandlerNumbers ?? userRecord.junior_handler_numbers)
        ?.AKC || '',
    juniorHandlerNumberUKC:
      normalizeJuniorHandlerNumbers(user.juniorHandlerNumbers ?? userRecord.junior_handler_numbers)
        ?.UKC || '',
    profileImage: user.profileImage || (userRecord.profile_image_url as string) || '',
    judgeQualifications: (user.judgeQualifications as JudgeQualification[]) || [],
    roles: (user.roles || []) as unknown as string[], // Handle UserRole[] type
    bio: (userRecord.bio as string) || '', // Extended field
    website: (userRecord.website as string) || '', // Extended field
    emergencyContact: (userRecord.emergencyContact as string) || '', // Extended field
    emergencyPhone: (userRecord.emergencyPhone as string) || '', // Extended field
  };

  logger.debug('UserEditPanel userToFormData debug:', 'panels', {
    data: {
      originalUser: user,
      userRecord: userRecord,
      resultingFormData: result,
      addressSources: {
        'user.address': user.address,
        'userRecord.street_address': userRecord.street_address,
      },
    },
  });

  return result;
};

// Convert form data back to UserType
export const formDataToUser = (formData: UserFormData): Partial<UserType> => ({
  firstName: formData.firstName,
  lastName: formData.lastName,
  email: formData.email,
  phone: formData.phone,
  address: formData.address,
  city: formData.city,
  state: formData.state,
  zipCode: formData.zipCode,
  dateOfBirth: formData.dateOfBirth,
  // Reassembled into the keyed map the column stores. A blank input means "no
  // number", so the key is omitted rather than written as an empty string — the
  // forms treat '' and absent alike, but an empty string is a value a later
  // reader could print.
  juniorHandlerNumbers: {
    ...(formData.juniorHandlerNumberAKC.trim()
      ? { AKC: formData.juniorHandlerNumberAKC.trim() }
      : {}),
    ...(formData.juniorHandlerNumberUKC.trim()
      ? { UKC: formData.juniorHandlerNumberUKC.trim() }
      : {}),
  },
  profileImage: formData.profileImage,
  judgeQualifications: formData.judgeQualifications,
  roles: formData.roles as UserRole[],
  ...(formData.bio && ({ bio: formData.bio } as Record<string, unknown>)),
  ...(formData.website && ({ website: formData.website } as Record<string, unknown>)),
  ...(formData.emergencyContact &&
    ({ emergencyContact: formData.emergencyContact } as Record<string, unknown>)),
  ...(formData.emergencyPhone &&
    ({ emergencyPhone: formData.emergencyPhone } as Record<string, unknown>)),
});
