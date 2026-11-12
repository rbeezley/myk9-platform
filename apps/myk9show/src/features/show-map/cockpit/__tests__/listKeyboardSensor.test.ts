import { describe, expect, it } from 'vitest';

import { scrollAncestorsThatMoveList } from '../listKeyboardSensor';

function tree(stickyPanel: boolean) {
  const page = document.createElement('div');
  const column = document.createElement('div');
  const panel = document.createElement('div');
  const tableScroll = document.createElement('div');
  const row = document.createElement('tr');
  if (stickyPanel) panel.style.position = 'sticky';
  page.append(column);
  column.append(panel);
  panel.append(tableScroll);
  tableScroll.append(row);
  document.body.append(page);
  return { page, column, panel, tableScroll, row };
}

describe('scrollAncestorsThatMoveList (MYK9-1902)', () => {
  it('keeps every scroll container when the list is not in a sticky panel (phone layout)', () => {
    const { column, panel, tableScroll, row } = tree(false);
    expect(scrollAncestorsThatMoveList([tableScroll, panel, column], row)).toEqual([
      tableScroll,
      panel,
      column,
    ]);
  });

  it('drops the containers outside the sticky panel, keeping the panel and what is inside it', () => {
    const { column, panel, tableScroll, row } = tree(true);
    expect(scrollAncestorsThatMoveList([tableScroll, panel, column], row)).toEqual([
      tableScroll,
      panel,
    ]);
  });

  it('keeps everything when there is no active node', () => {
    const { column, panel } = tree(true);
    expect(scrollAncestorsThatMoveList([panel, column], null)).toEqual([panel, column]);
  });
});
