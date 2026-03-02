import type { Dog, DogInput, Owner } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import type { UserRole } from '@/types/auth-types';
import type { ExtendedAncestor } from '@/components/dogs/DogDetails/Pedigree/PedigreeAncestorAddDialog';

export interface DogDetailsMainProps {
  dog: Dog;
  fromPerson?: User | undefined;
  onDelete?: () => void;
  onUpdate?: (id: string, updates: Partial<DogInput>) => Promise<Dog | null>;
}

export interface EditableValueProps {
  value: string | undefined | null;
  onEdit: () => void;
  suffix?: string;
  formatFn?: (val: string) => string;
}

export interface HeroProfileCardProps {
  dog: Dog;
  showCelebration: boolean;
  recentUpdate: string | null;
  isPhotoHovered: boolean;
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
  ancestors: ExtendedAncestor[];
  onSetAncestors: React.Dispatch<React.SetStateAction<ExtendedAncestor[]>>;
}

export interface DogDialogsProps {
  dog: Dog;
  isEditPanelOpen: boolean;
  isDeleteDialogOpen: boolean;
  isPhotoDialogOpen: boolean;
  photoPreview: string | null;
  isPhotoDragging: boolean;
  showCelebration: boolean;
  userRole: UserRole;
  people: User[];
  onEditPanelClose: () => void;
  onDeleteDialogClose: () => void;
  onDelete?: (() => void) | undefined;
  onUpdate?: ((id: string, updates: Partial<DogInput>) => Promise<Dog | null>) | undefined;
  onPhotoDialogOpen: (open: boolean) => void;
  onPhotoDrop: (e: React.DragEvent) => void;
  onPhotoDragOver: (e: React.DragEvent) => void;
  onPhotoDragLeave: (e: React.DragEvent) => void;
  onPhotoFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPhotoSave: (preview: string | null) => void;
  onSetUpdatedDog: React.Dispatch<React.SetStateAction<Dog>>;
  onSetShowCelebration: React.Dispatch<React.SetStateAction<boolean>>;
  onSetRecentUpdate: React.Dispatch<React.SetStateAction<string | null>>;
  onSetIsEditPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}
