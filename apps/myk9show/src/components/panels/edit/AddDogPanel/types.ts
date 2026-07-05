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
  /**
   * When provided, the "Dog saved" confirmation toast gains an "Enter a show"
   * next-action that calls this with the new dog (4.E). Opt-in per caller so it
   * only appears where entering a show is the natural next step (the standalone
   * Dogs page) — not mid-registration, where the dog is already being entered.
   */
  onEnterShowWithDog?: ((dog: DogType) => void) | undefined;
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

/**
 * Factory for a fresh initial form-data object. A factory (not a shared const)
 * prevents accidental cross-instance mutation of the `registrations` array.
 */
export const createInitialFormData = (): DogFormData => ({
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
});

export type TabValue = 'basic' | 'registration' | 'optional';
