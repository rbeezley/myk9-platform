import type { Dog as DogType, Registration } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import type { EditPanelVariant } from '../EditPanelWrapper';

export interface AddDogPanelProps {
  open: boolean;
  onClose: () => void;
  /** `existing` is true when a duplicate match was chosen instead of creating a dog. */
  onDogCreated: (dog: DogType, options?: { existing?: boolean }) => void;
  userRole?: UserRole | undefined;
  currentUserPersonId?: string | undefined;
  variant?: EditPanelVariant;
  offlineFirst?: boolean | undefined;
  offlineDependsOn?: string[] | undefined;
  /**
   * When provided, the "Dog saved" confirmation toast gains an "Enter a show"
   * next-action that calls this with the new dog (4.E). Opt-in per caller so it
   * only appears where entering a show is the natural next step (the standalone
   * Dogs page) — not mid-registration, where the dog is already being entered.
   */
  onEnterShowWithDog?: ((dog: DogType) => void) | undefined;
  /**
   * `YYYY-MM-DD` start of the show being entered, when the caller is mid-
   * registration. The date-of-birth warning judges "old enough" on that day
   * instead of today (MYK9-1060).
   */
  showStartDate?: string | undefined;
  /**
   * The show whose add-entry flow opened the panel. Recorded on the new dog as
   * `created_from_show_id` so an admin diagnostic can find dogs added and never
   * entered (MYK9-1059). Left unset everywhere else.
   */
  createdFromShowId?: string | undefined;
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
