import { ClassData, EntryData } from './types/classTypes';
import { Show } from '@/types/show-types';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

export interface ClassDetailsMainProps {
  classData: ClassData;
  classEntries: EntryData[];
  rawEntries?: RawEntryRow[] | undefined;
  parentShow?: Show | undefined;
  onAddEntry: () => void;
  onDeleteEntry?: (entryId: string) => void;
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
