import { ClassData } from './types/classTypes';
import { TrialClass } from '@/components/trials/types/trial.types';

export interface EditClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updatedClass: ClassData | TrialClass) => void;
  classItem: ClassData | TrialClass | null;
  showId?: string;
  mode?: 'full' | 'simple'; // 'full' for ClassData with tabs, 'simple' for TrialClass
}
