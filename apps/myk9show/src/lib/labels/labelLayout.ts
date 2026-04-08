import type { LabelTemplate } from './labelTemplates';

export interface LabelCell<T = unknown> {
  type: 'item' | 'empty' | 'skip';
  item?: T;
  index: number;
}

export interface LabelPage<T = unknown> {
  pageNumber: number;
  cells: LabelCell<T>[];
}

export function buildLabelPages<T>(
  template: LabelTemplate,
  items: T[],
  skip: number
): LabelPage<T>[] {
  if (items.length === 0 && skip === 0) return [];

  const perSheet = template.labelsPerSheet;
  const totalCells = skip + items.length;
  const totalPages = Math.max(1, Math.ceil(totalCells / perSheet));
  const pages: LabelPage<T>[] = [];

  let itemIdx = 0;
  let skipRemaining = skip;

  for (let p = 0; p < totalPages; p++) {
    const cells: LabelCell<T>[] = [];
    for (let i = 0; i < perSheet; i++) {
      if (skipRemaining > 0) {
        cells.push({ type: 'skip', index: i });
        skipRemaining--;
      } else if (itemIdx < items.length) {
        cells.push({ type: 'item', item: items[itemIdx], index: i });
        itemIdx++;
      } else {
        cells.push({ type: 'empty', index: i });
      }
    }
    pages.push({ pageNumber: p + 1, cells });
  }

  return pages;
}
