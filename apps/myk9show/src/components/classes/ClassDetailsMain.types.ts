import { ClassData, EntryData } from './types/classTypes';
import { Show } from '@/types/show-types';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

export interface ClassDetailsMainProps {
  classData: ClassData;
  classEntries: EntryData[];
  rawEntries?: RawEntryRow[] | undefined;
  parentShow?: Show | undefined;
}
