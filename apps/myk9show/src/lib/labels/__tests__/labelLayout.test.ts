import { buildLabelPages } from '../labelLayout';
import type { LabelTemplate } from '../labelTemplates';

const template14: LabelTemplate = {
  id: '18262',
  name: 'test',
  labelWidth: 4,
  labelHeight: 1.333,
  columns: 2,
  rows: 7,
  labelsPerSheet: 14,
  pageMarginTop: 0,
  pageMarginBottom: 0,
  pageMarginLeft: 0,
  pageMarginRight: 0,
  gapX: 0,
  gapY: 0,
};
const template4: LabelTemplate = {
  id: '8387',
  name: 'test',
  labelWidth: 4.25,
  labelHeight: 5.5,
  columns: 2,
  rows: 2,
  labelsPerSheet: 4,
  pageMarginTop: 0,
  pageMarginBottom: 0,
  pageMarginLeft: 0,
  pageMarginRight: 0,
  gapX: 0,
  gapY: 0,
};

describe('buildLabelPages', () => {
  it('returns empty array for zero items', () => {
    const pages = buildLabelPages(template14, [], 0);
    expect(pages).toHaveLength(0);
  });

  it('places items sequentially on a single page', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
    const pages = buildLabelPages(template14, items, 0);
    expect(pages).toHaveLength(1);
    expect(pages[0].cells).toHaveLength(14);
    expect(pages[0].cells.filter((c) => c.type === 'item')).toHaveLength(5);
    expect(pages[0].cells.filter((c) => c.type === 'empty')).toHaveLength(9);
  });

  it('skips the first N cells', () => {
    const items = [{ id: 'a' }];
    const pages = buildLabelPages(template14, items, 3);
    expect(pages).toHaveLength(1);
    expect(pages[0].cells[0].type).toBe('skip');
    expect(pages[0].cells[1].type).toBe('skip');
    expect(pages[0].cells[2].type).toBe('skip');
    expect(pages[0].cells[3].type).toBe('item');
    expect(pages[0].cells[3].item).toEqual({ id: 'a' });
  });

  it('wraps to a second page when items exceed sheet capacity', () => {
    const items = Array.from({ length: 16 }, (_, i) => ({ id: String(i) }));
    const pages = buildLabelPages(template14, items, 0);
    expect(pages).toHaveLength(2);
    expect(pages[0].cells.filter((c) => c.type === 'item')).toHaveLength(14);
    expect(pages[1].cells.filter((c) => c.type === 'item')).toHaveLength(2);
  });

  it('skip only applies to first page', () => {
    const items = Array.from({ length: 14 }, (_, i) => ({ id: String(i) }));
    const pages = buildLabelPages(template14, items, 4);
    expect(pages[0].cells.filter((c) => c.type === 'skip')).toHaveLength(4);
    expect(pages[0].cells.filter((c) => c.type === 'item')).toHaveLength(10);
    expect(pages).toHaveLength(2);
    expect(pages[1].cells.filter((c) => c.type === 'item')).toHaveLength(4);
    expect(pages[1].cells.filter((c) => c.type === 'skip')).toHaveLength(0);
  });

  it('handles skip exceeding first page', () => {
    const items = [{ id: 'x' }];
    const pages = buildLabelPages(template14, items, 14);
    expect(pages).toHaveLength(2);
    expect(pages[0].cells.filter((c) => c.type === 'skip')).toHaveLength(14);
    expect(pages[1].cells[0].type).toBe('item');
  });

  it('works with 4-per-sheet template', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: String(i) }));
    const pages = buildLabelPages(template4, items, 0);
    expect(pages).toHaveLength(2);
    expect(pages[0].cells.filter((c) => c.type === 'item')).toHaveLength(4);
    expect(pages[1].cells.filter((c) => c.type === 'item')).toHaveLength(2);
  });
});
