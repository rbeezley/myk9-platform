import { describe, expect, it } from 'vitest';
import type { Column } from '@tanstack/react-table';
import { pickExportColumns } from './exportColumns';

function col(id: string, visible: boolean, meta: Record<string, unknown> = {}) {
  return { id, getIsVisible: () => visible, columnDef: { meta } } as unknown as Column<
    unknown,
    unknown
  >;
}

describe('pickExportColumns', () => {
  it('keeps visible columns, drops the selection column and exportDisabled ones', () => {
    const picked = pickExportColumns([
      col('_select', true),
      col('name', true),
      col('actions', true, { exportDisabled: true }),
    ]);
    expect(picked.map(c => c.id)).toEqual(['name']);
  });

  it('drops a hidden column unless it is marked exportHidden', () => {
    const picked = pickExportColumns([
      col('name', true),
      col('organization', false, { exportHidden: true }),
      col('notes', false),
    ]);
    expect(picked.map(c => c.id)).toEqual(['name', 'organization']);
  });
});
