import { ClassData, EntryData } from './types/classTypes';
import { Show } from '@/types/show-types';
import { Trial } from '@/components/trials/types/trial.types';

export interface ClassDetailsMainProps {
  classData: ClassData;
  classEntries: EntryData[];
  parentShow?: Show;
  parentTrial?: Trial;
  isResultsView?: boolean;
  onEditClass: () => void;
  onDeleteClass: () => void;
  onEditPhoto?: () => void;
  onViewTrial?: () => void;
  onAddEntry: () => void;
  onDeleteEntry?: (entryId: string) => void;
  onStatusChange?: (newStatus: string) => void;
  onResultUpdate?: (entryId: string, result: Partial<EntryData>) => Promise<void>;
}

export interface ClassStat {
  title: string;
  value: string;
  trend: string;
  detail1: string;
  detail2: string;
  detail3?: string | undefined;
  progress: number;
  type: string;
}
