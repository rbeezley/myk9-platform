import type { Dog as DogType, DogStatus, Registration } from '@/types/dog-types';
import type { User as PersonType } from '@/types/user-types';
import { UserRole } from '@/types/auth-types';

export type { DogType, DogStatus, Registration, PersonType };
export { UserRole };

export interface DogEditContextType {
  isAdmin: boolean;
  /**
   * May this viewer change who owns the dog (`can_change_dog_owner`, MYK9-1158)? Staff who may
   * edit an account holder's dog can still not re-own it; they see the owner read-only.
   * Absent means yes (the picker's own `isAdmin` gate still applies).
   */
  canChangeOwner?: boolean;
  people: PersonType[];
  /**
   * Lifecycle status as currently stored, for the read-only Status row. NOT part
   * of `DogFormData`: the field is owned by `DogStatusDialog`, and putting it in
   * this form would make two editors for one column.
   */
  dogStatus?: DogStatus | undefined;
  /** Date of passing, already formatted for display, beside a `deceased` status. */
  dogDeceasedDate?: string | undefined;
  /**
   * Raises the status dialog. Omit on a surface that has no dialog mounted
   * (the person-detail Dogs tab, MYK9-594) and the Status row renders
   * read-only — badge, no button — rather than a control that does nothing.
   */
  onChangeStatus?: (() => void) | undefined;
}

import type { EditPanelDeleteOption } from './EditPanelDelete';
import type { EditPanelVariant } from './EditPanelWrapper.types';

export interface DogEditPanelProps {
  open: boolean;
  onClose: () => void;
  dogId: string;
  dogName: string;
  initialDogData: Partial<DogType>;
  onSave?: (dogData: Partial<DogType>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
  /** User role - admins can change dog ownership */
  userRole?: UserRole;
  /** People list for owner selection (required for admins) */
  people?: PersonType[];
  /** "Delete dog" in the footer. Omit for a viewer who cannot delete. */
  onDelete?: EditPanelDeleteOption | undefined;
  /** Current lifecycle status, for the read-only Status row. */
  dogStatus?: DogStatus | undefined;
  /** Date of passing, already formatted for display. */
  dogDeceasedDate?: string | undefined;
  /** Raises the status dialog; omit to render the Status row read-only. */
  onChangeStatus?: (() => void) | undefined;
  /** 'inline' inside Quick Create's one slide-out; the default is the slide-over panel. */
  variant?: EditPanelVariant | undefined;
  /** `inline` only: filled with the form's close request, for the host's Back / Escape / X. */
  closeRequestRef?: import('react').MutableRefObject<(() => void) | null> | undefined;
}

// Form data interface matching DogProfileEditDialog expectations
export interface DogFormData extends Record<string, unknown> {
  callName: string;
  gender: string;
  dateOfBirth: string;
  color: string;
  weight: string;
  height: string;
  microchip: string;
  imageUrl?: string;
  ownerId: string;
  registrations: Registration[];
  healthRecords: DogType['healthRecords'];
  // Optional advanced fields
  notes?: string;
  specialNeeds?: string;
  spayedNeutered?: boolean;
}
