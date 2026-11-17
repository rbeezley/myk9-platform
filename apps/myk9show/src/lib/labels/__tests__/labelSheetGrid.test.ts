import { describe, expect, it } from 'vitest';

import { armbandLabelSubjectKey } from '../armbandSubjectKey';
import { buildLabelSheetCells, skipForStartPosition } from '../labelSheetGrid';
import { LABEL_TEMPLATES } from '../labelTemplates';
import { buildArmbandPaperworkDescriptor } from '@/features/show-map/cockpit/paperworkPrintState';
import { labelKeyOf } from '../armbandLabelChoice';

describe('label sheet grid (MYK9-2073)', () => {
  it('lays the default sheet out as 7 rows of 2, greying the labels already used', () => {
    const cells = buildLabelSheetCells(LABEL_TEMPLATES['18262']!, 4);
    expect(cells).toHaveLength(14);
    expect(cells[0]).toMatchObject({ position: 1, row: 0, column: 0, used: true });
    expect(cells[3]).toMatchObject({ position: 4, row: 1, column: 1, used: true });
    expect(cells[4]).toMatchObject({ position: 5, row: 2, column: 0, used: false });
    expect(cells.filter(cell => cell.used)).toHaveLength(4);
  });

  it('skips one fewer label than the position tapped', () => {
    expect(skipForStartPosition(1)).toBe(0);
    expect(skipForStartPosition(5)).toBe(4);
  });
});

describe('armband label subject key (MYK9-2073)', () => {
  const label = { dogId: 'dog-1', armband: 101, calendarDay: '2026-12-07' };

  it('is the key the print record is written under and the added-since reader looks up', () => {
    const descriptor = buildArmbandPaperworkDescriptor({ kind: 'show', showId: 's' }, [
      { ...label, callName: 'Juni', handlerName: 'J' },
    ]);
    const written = Object.keys(descriptor.coverage.subjectFingerprints);
    expect(written).toEqual([armbandLabelSubjectKey(label)]);
    expect(
      labelKeyOf({
        ...label,
        id: 'e1',
        trialId: 't',
        classId: 'c',
        callName: 'Juni',
        breed: '',
        handler: 'J',
        trialDate: '',
        isDayOfShow: false,
      })
    ).toBe(written[0]);
  });

  it('falls back to the armband when the entry has no dog id', () => {
    expect(armbandLabelSubjectKey({ ...label, dogId: '' })).toBe('dog-day:armband:101:2026-12-07');
  });
});
