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
  /**
   * Read the table with an exhibitor's permissions whatever the viewer's role. Staff run a class on
   * Show Desk, so the class page never gives them its editable cells or Add and Delete controls.
   */
  readOnly?: boolean;
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
