import type { User as UserType, UserRole, JudgeQualification } from '@/types/user-types';
import { logger } from '@/services/LoggingService';
import type { UserFormData } from './UserEditPanel.types';

// Form validation
export const validateUserData = (data: UserFormData): string[] | null => {
  const errors: string[] = [];

  logger.debug('UserEditPanel validation debug:', 'panels', {
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      address: data.address,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      roles: data.roles,
      formDataKeys: Object.keys(data),
    },
  });

  if (!data.firstName?.trim()) {
    errors.push('First name is required');
  }

  if (!data.lastName?.trim()) {
    errors.push('Last name is required');
  }

  if (!data.email?.trim()) {
    errors.push('Email is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Please enter a valid email address');
  }

  // Phone and address are optional for basic user profiles
  // Only validate they are properly formatted if provided
  if (data.phone && !/^[\d\s\-().+]+$/.test(data.phone.trim())) {
    errors.push('Please enter a valid phone number');
  }

  // Address fields are optional but should be validated if any are provided
  const hasAddressInfo =
    data.address?.trim() || data.city?.trim() || data.state?.trim() || data.zipCode?.trim();

  if (hasAddressInfo) {
    // If user starts filling address info, require the basic fields
    if (!data.city?.trim()) {
      errors.push('City is required when providing address information');
    }
    if (!data.state?.trim()) {
      errors.push('State is required when providing address information');
    }
  }

  // Validate judge qualifications if present
  data.judgeQualifications?.forEach((qual: JudgeQualification, index: number) => {
    if (!qual.judgeNumber?.trim()) {
      errors.push(`Judge qualification ${index + 1}: Judge number is required`);
    }
    if (!qual.organization) {
      errors.push(`Judge qualification ${index + 1}: Organization is required`);
    }
    if (!qual.certificationDate) {
      errors.push(`Judge qualification ${index + 1}: Certification date is required`);
    }
  });

  if (errors.length > 0) {
    logger.debug('UserEditPanel validation errors:', 'panels', { data: errors });
  } else {
    logger.debug('UserEditPanel validation passed', 'components', {});
  }

  return errors.length > 0 ? errors : null;
};

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
    profileImage: user.profileImage || (userRecord.profile_image_url as string) || '',
    judgeQualifications: (user.judgeQualifications as JudgeQualification[]) || [],
    roles: (user.roles || []) as unknown as string[], // Handle UserRole[] type
    status: (userRecord.status as 'active' | 'suspended') || 'active',
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
  profileImage: formData.profileImage,
  judgeQualifications: formData.judgeQualifications,
  roles: formData.roles as UserRole[],
  status: formData.status,
  ...(formData.bio && ({ bio: formData.bio } as Record<string, unknown>)),
  ...(formData.website && ({ website: formData.website } as Record<string, unknown>)),
  ...(formData.emergencyContact &&
    ({ emergencyContact: formData.emergencyContact } as Record<string, unknown>)),
  ...(formData.emergencyPhone &&
    ({ emergencyPhone: formData.emergencyPhone } as Record<string, unknown>)),
});
