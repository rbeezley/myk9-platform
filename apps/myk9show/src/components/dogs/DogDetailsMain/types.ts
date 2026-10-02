import type { Dog, DogInput, Owner } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import type { UserRole } from '@/types/auth-types';
import type { DogCardRegistration } from '@/components/dogs/common/dogRegistryModel';

export interface DogDetailsMainProps {
  dog: Dog;
  fromPerson?: User | undefined;
  /** The shared delete dialog started deleting this dog. */
  onDeleteStart?: (() => void) | undefined;
  /** After the shared delete dialog deleted this dog (soft, with Undo). */
  onDeleted?: ((dogId: string) => void) | undefined;
  /** The delete did not happen (refused or failed); the dialog stays open. */
  onDeleteFailed?: (() => void) | undefined;
  onUpdate?: (id: string, updates: Partial<DogInput>) => Promise<Dog | null>;
}

export interface EditableValueProps {
  value: string | undefined | null;
  onEdit: () => void;
  suffix?: string;
  formatFn?: (val: string) => string;
}

export interface DogIdentityRailProps {
  dog: Dog;
  owner: Owner;
  /** Live registrations when loaded; falls back to `dog.registrations`. */
  registrations?: DogCardRegistration[] | undefined;
  /** Opens the add-registration panel on Overview. */
  onAddRegistration?: (() => void) | undefined;
  /** Opens the registration-management panel. */
  onManageRegistrations?: (() => void) | undefined;
  /** The registrations read failed — distinct from the dog having none. */
  registrationsFailed?: boolean | undefined;
  /** The registrations read is still in flight — also not "has none". */
  registrationsLoading?: boolean | undefined;
  onRetryRegistrations?: (() => void) | undefined;
  role?: 'exhibitor' | 'secretary';
  /**
   * The viewer may open `/people/:id` (the route is SECRETARY | SITE_ADMIN). When false the
   * owner's name is plain text rather than a link to a page that would refuse them.
   */
  canOpenOwnerRecord?: boolean;
}

export interface DogInfoCardsProps {
  dog: Dog;
  onEditPanelOpen: () => void;
}

export interface OwnerInfoCardProps {
  dog: Dog;
  owner: Owner;
}

export interface DogSummaryCardProps {
  dog: Dog;
}

export interface DogDetailsTabsProps {
  dog: Dog;
  role?: 'exhibitor' | 'secretary';
  /** `canManageDogRegistrations` for this viewer; gates the narrow surface's registration controls. */
  canEditRegistrations: boolean;
}

export interface DogDialogsProps {
  dog: Dog;
  isEditPanelOpen: boolean;
  isPhotoDialogOpen: boolean;
  photoPreview: string | null;
  isPhotoDragging: boolean;
  isSavingPhoto: boolean;
  showCelebration: boolean;
  userRole: UserRole;
  people: User[];
  onEditPanelClose: () => void;
  /**
   * Whether the viewer may delete this dog (`useCanDeleteDog`, the `soft_delete_dog` gate).
   * Delete dog is the Edit panel's footer button; false hides it.
   */
  canDelete: boolean;
  /** Raises the status dialog from inside the Edit Dog panel's Status row. */
  onStatusDialogOpen?: (() => void) | undefined;
  onDeleteStart?: (() => void) | undefined;
  /** After the shared delete dialog deleted this dog. */
  onDeleted?: ((dogId: string) => void) | undefined;
  onDeleteFailed?: (() => void) | undefined;
  onUpdate?: ((id: string, updates: Partial<DogInput>) => Promise<Dog | null>) | undefined;
  onPhotoDialogOpen: (open: boolean) => void;
  onPhotoDrop: (e: React.DragEvent) => void;
  onPhotoDragOver: (e: React.DragEvent) => void;
  onPhotoDragLeave: (e: React.DragEvent) => void;
  onPhotoFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPhotoSave: () => Promise<boolean>;
  onSetUpdatedDog: React.Dispatch<React.SetStateAction<Dog>>;
  onSetShowCelebration: React.Dispatch<React.SetStateAction<boolean>>;
  onSetRecentUpdate: React.Dispatch<React.SetStateAction<string | null>>;
  onSetIsEditPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}
