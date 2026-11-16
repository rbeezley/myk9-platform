import type { LabelTemplate } from './labelTemplates';

export interface LabelSheetCell {
  /** 1-based position on the sheet, left to right then top to bottom, as labels are filled. */
  position: number;
  row: number;
  column: number;
  /** A label before the first unused one: already peeled off. */
  used: boolean;
}

/** The sheet as a grid: every label position, with the first `skip` marked used. */
export function buildLabelSheetCells(
  template: Pick<LabelTemplate, 'rows' | 'columns' | 'labelsPerSheet'>,
  skip: number
): LabelSheetCell[] {
  const total = template.labelsPerSheet || template.rows * template.columns;
  return Array.from({ length: total }, (_, index) => ({
    position: index + 1,
    row: Math.floor(index / template.columns),
    column: index % template.columns,
    used: index < skip,
  }));
}

/** Tapping the first unused label at `position` means skipping the ones before it. */
export const skipForStartPosition = (position: number): number => Math.max(0, position - 1);
