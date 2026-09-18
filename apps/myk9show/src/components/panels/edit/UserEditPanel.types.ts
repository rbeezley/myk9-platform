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
  /**
   * MYK9-570 round-2 review: did the row this form was seeded from actually
   * CARRY the junior handler fields?
   *
   * `/admin/users` loads through the `get_admin_user_list` RPC, whose signature
   * returns neither column. They arrived undefined, rendered blank, and were
   * then saved back as `null` / `{}` — a site admin fixing a phone number wiped
   * a handler's date of birth and AKC junior number. Partial rows are legitimate
   * (see `MappableDbUser`), so the form has to remember which half it got.
   *
   * False means "blank because it was never loaded" — do not write it back.
   * It flips to true the moment someone types a value, so this never blocks an
   * admin from FILLING the fields in, only from silently emptying them.
   */
  juniorHandlerFieldsLoaded: boolean;
  profileImage?: string;
  judgeQualifications: JudgeQualification[];
  roles: string[];
  // Optional advanced fields
  bio?: string;
  website?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}
