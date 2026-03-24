import { ClassData, EntryData } from './types/classTypes';
import { Show } from '@/types/show-types';

export interface ClassDetailsMainProps {
  classData: ClassData;
  classEntries: EntryData[];
  parentShow?: Show | undefined;
  onAddEntry: () => void;
  onDeleteEntry?: (entryId: string) => void;
  onResultUpdate?: (entryId: string, result: Partial<EntryData>) => Promise<void>;
  /** Opens the requirements panel/drawer */
  onOpenRequirements?: () => void;
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
