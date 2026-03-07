import type { Dog as DogType, Registration } from '@/types/dog-types';
import type { User as PersonType } from '@/types/user-types';
import { UserRole } from '@/types/auth-types';

export type { DogType, Registration, PersonType };
export { UserRole };

export interface DogEditContextType {
  isAdmin: boolean;
  people: PersonType[];
}

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
}

// Form data interface matching DogProfileEditDialog expectations
export interface DogFormData extends Record<string, unknown> {
  callName: string;
  registeredName: string;
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
