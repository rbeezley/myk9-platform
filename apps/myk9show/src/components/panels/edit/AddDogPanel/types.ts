import type { Dog as DogType, Registration } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import type { EditPanelVariant } from '../EditPanelWrapper';

export interface AddDogPanelProps {
  open: boolean;
  onClose: () => void;
  onDogCreated: (dog: DogType) => void;
  userRole?: UserRole | undefined;
  currentUserPersonId?: string | undefined;
  variant?: EditPanelVariant;
}

export interface DogFormData extends Record<string, unknown> {
  // Basic Information
  callName: string;
  gender: 'Male' | 'Female' | '';
  dateOfBirth: string;
  color: string;

  // Optional Information
  height: string;
  weight: string;
  microchip: string;
  spayedNeutered: boolean;
  imageUrl: string;

  // Owner Information
  ownerId: string;

  // Registration Information
  registrations: Registration[];
}

export const INITIAL_FORM_DATA: DogFormData = {
  callName: '',
  gender: '',
  dateOfBirth: '',
  color: '',
  height: '',
  weight: '',
  microchip: '',
  spayedNeutered: false,
  imageUrl: '',
  ownerId: '',
  registrations: [],
};

export type TabValue = 'basic' | 'registration' | 'optional';
