import type { Dog, DogInput, Owner } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import type { UserRole } from '@/types/auth-types';

export interface DogDetailsMainProps {
  dog: Dog;
  fromPerson?: User | undefined;
  onDelete?: () => Promise<void>;
  onUpdate?: (id: string, updates: Partial<DogInput>) => Promise<Dog | null>;
  isDeleting?: boolean;
}

export interface EditableValueProps {
  value: string | undefined | null;
  onEdit: () => void;
  suffix?: string;
  formatFn?: (val: string) => string;
}

export interface HeroProfileCardProps {
  dog: Dog;
  role?: 'exhibitor' | 'secretary';
  onEditPanelOpen: () => void;
  onPhotoDialogOpen: () => void;
  onDeleteDialogOpen: () => void;
  onStatusDialogOpen?: () => void;
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
  autoOpenAddRegistration: boolean;
  registrationsCount?: number;
  role?: 'exhibitor' | 'secretary';
}

export interface DogDialogsProps {
  dog: Dog;
  isEditPanelOpen: boolean;
  isDeleteDialogOpen: boolean;
  isPhotoDialogOpen: boolean;
  photoPreview: string | null;
  isPhotoDragging: boolean;
  isSavingPhoto: boolean;
  showCelebration: boolean;
  userRole: UserRole;
  people: User[];
  isDeleting?: boolean;
  onEditPanelClose: () => void;
  onDeleteDialogClose: () => void;
  onDelete?: (() => Promise<void>) | undefined;
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
