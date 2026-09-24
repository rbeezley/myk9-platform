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
   * MYK9-570 / MYK9-664: a date of birth to SET, ISO `YYYY-MM-DD`, or '' to
   * leave what is stored alone. WRITE-ONLY: this panel is the show manager's
   * person editor, and a manager may set a handler's date of birth but never
   * read it back, so the form always starts blank.
   */
  dateOfBirth: string;
  /**
   * MYK9-570 / MYK9-664: junior handler numbers to SET, keyed by `RegistryId`.
   * Write-only for the same reason; a blank input leaves the stored number
   * alone (the save is a merge patch, see `juniorHandlerNumbersPatch`).
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
