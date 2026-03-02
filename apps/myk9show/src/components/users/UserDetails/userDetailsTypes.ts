import type { User as UserType } from '@/types/user-types';
import type { JudgeQualification } from '@/types/judge-types';

export interface UserFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  photo: string;
  bio: string;
  deletedAt: string | null;
  deletedBy: string | null;
  judgeQualifications: JudgeQualification[];
  roles: UserType['roles'] | [];
}

export function extractPersonName(person: UserType): {
  firstName: string;
  lastName: string;
  fullName: string;
} {
  const personRecord = person as unknown as Record<string, unknown>;
  const firstName = person.firstName || (personRecord.first_name as string) || '';
  const lastName = person.lastName || (personRecord.last_name as string) || '';
  const fullName =
    firstName && lastName ? `${firstName} ${lastName}` : person.email || 'Unknown User';
  return { firstName, lastName, fullName };
}

export function buildFormData(person: UserType): UserFormData {
  const personRec = person as unknown as Record<string, unknown>;
  const { fullName } = extractPersonName(person);

  return {
    name: fullName,
    email: person.email || '',
    phone: person.phone || '',
    address: person.address || person.streetAddress || (personRec.street_address as string) || '',
    city: person.city || '',
    state: person.state || '',
    zipCode: person.zipCode || (personRec.zip_code as string) || '',
    photo:
      person.profileImage ||
      (personRec.profile_image_url as string) ||
      (personRec.profile_image as string) ||
      '',
    bio: '',
    deletedAt: null,
    deletedBy: null,
    judgeQualifications: person.judgeQualifications || [],
    roles: person.roles || [],
  };
}
