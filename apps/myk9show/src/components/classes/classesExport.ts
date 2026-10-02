/** What a class row needs to be exported; every field but id and status may be missing. */
export interface ClassExportItem {
  id: string;
  name?: string | null | undefined;
  status: string | null;
  trialLabel?: string | undefined;
  element?: string | null | undefined;
  level?: string | null | undefined;
  section?: string | null | undefined;
  judgeName?: string | null | undefined;
  time?: string | null | undefined;
  ring?: number | string | null | undefined;
  entryCount?: number | null | undefined;
}

/**
 * The Classes list's CSV columns, shared by the whole-list "Export CSV" page action and the bulk
 * bar's selection export (MYK9-929).
 */
export const CLASS_EXPORT_HEADERS = [
  'Trial',
  'Element',
  'Level',
  'Section',
  'Judge',
  'Time',
  'Ring',
  'Status',
  'Entries',
] as const;

export function classExportRows(
  classes: readonly ClassExportItem[]
): Array<Array<string | number | null | undefined>> {
  return classes.map(cls => [
    cls.trialLabel,
    cls.element,
    cls.level,
    cls.section,
    cls.judgeName,
    cls.time,
    cls.ring,
    cls.status,
    cls.entryCount,
  ]);
}
