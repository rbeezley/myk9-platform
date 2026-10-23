import type { ColumnDef } from '@/components/ui/data-table';
import { matchesListSearch } from '@/components/ui/data-table/listSearch';
import type { ClassTableRow } from './classesTabColumns';
import type { ClassInfo } from './classInfo';
import { classTrialLabel } from './classInfo';

/**
 * The one list search, read from the table's own columns, so typing what a row shows (its level
 * and section, judge, status, time) finds it.
 */
export function narrowClasses(
  classes: ClassInfo[],
  search: string,
  columns: ReadonlyArray<ColumnDef<ClassTableRow, unknown>>
): ClassInfo[] {
  return classes.filter(cls =>
    matchesListSearch({ ...cls, trialLabel: classTrialLabel(cls) }, columns, search)
  );
}
