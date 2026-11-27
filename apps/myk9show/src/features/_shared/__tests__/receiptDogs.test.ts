import { describe, expect, it } from 'vitest';
import { buildReceiptDogs } from '../receiptDogs';

const dogs = [
  { id: 'lucy', callName: 'Lucy', registrations: [] },
  { id: 'coco', callName: null, registrations: [] },
];
const classes = [
  { id: 'cn', className: 'Container Novice A' },
  { id: 'in', className: 'Interior Novice A' },
];

describe('buildReceiptDogs', () => {
  it('keeps every selected dog, in order, each with only its own classes', () => {
    const result = buildReceiptDogs(
      [
        { dogId: 'lucy', selectedClasses: [{ classId: 'cn' }, { classId: 'in' }] },
        { dogId: 'coco', selectedClasses: [{ classId: 'in' }] },
      ],
      dogs,
      classes
    );

    expect(result.map(d => [d.id, d.callName, d.classSummary])).toEqual([
      ['lucy', 'Lucy', 'Container Novice A, Interior Novice A'],
      ['coco', null, 'Interior Novice A'],
    ]);
  });

  it('falls back to the class id and an empty name when a lookup misses', () => {
    const [only] = buildReceiptDogs(
      [{ dogId: 'gone', selectedClasses: [{ classId: 'x9' }] }],
      dogs,
      classes
    );

    expect(only).toEqual({ id: 'gone', registeredName: '', callName: null, classSummary: 'x9' });
  });
});
