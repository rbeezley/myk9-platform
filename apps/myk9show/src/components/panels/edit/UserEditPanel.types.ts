import type { User as UserType, JudgeQualification } from '@/types/user-types';

export interface UserEditPanelProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  initialUserData: Partial<UserType>;
  onSave?: (userData: Partial<UserType>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
}

// Form data interface matching PersonEditDialog expectations
export interface UserFormData extends Record<string, unknown> {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  /**
   * MYK9-570: ISO `YYYY-MM-DD`, or '' when unknown. Junior handler status is
   * derived from this per trial; there is no junior checkbox to set.
   */
  dateOfBirth: string;
  /**
   * MYK9-570: registry-issued junior handler numbers keyed by `RegistryId`. The
   * WHOLE map, not one field per rendered input — the form renders inputs only
   * for the registries that issue a number, and rebuilding the map from those
   * dropped any other stored key on save.
   */
  juniorHandlerNumbers: Record<string, string>;
  profileImage?: string;
  judgeQualifications: JudgeQualification[];
  roles: string[];
  // Optional advanced fields
  bio?: string;
  website?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}
