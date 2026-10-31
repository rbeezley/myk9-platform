import { describe, expect, it } from 'vitest';
import { compareClassOrder } from '../entryClassOrder';

describe('compareClassOrder trial names (MYK9-1592)', () => {
  it('keeps each unnumbered trial together instead of interleaving by element', () => {
    const classes = [
      {
        trialDate: '2026-11-07',
        trialNumber: 'UKC-Nosework',
        element: 'Container',
        level: 'Novice',
      },
      { trialDate: '2026-11-07', trialNumber: 'ASCA-Scent', element: 'Interior', level: 'Novice' },
      {
        trialDate: '2026-11-07',
        trialNumber: 'UKC-Nosework',
        element: 'Interior',
        level: 'Novice',
      },
    ];
    const order = [...classes].sort(compareClassOrder).map(c => `${c.trialNumber}/${c.element}`);
    expect(order).toEqual([
      'ASCA-Scent/Interior',
      'UKC-Nosework/Container',
      'UKC-Nosework/Interior',
    ]);
  });

  it('still treats "Trial 1" and "1" as the same trial', () => {
    const a = {
      trialDate: '2026-11-07',
      trialNumber: 'Trial 1',
      element: 'Interior',
      level: 'Novice',
    };
    const b = { trialDate: '2026-11-07', trialNumber: '1', element: 'Container', level: 'Novice' };
    expect(compareClassOrder(b, a)).toBeLessThan(0);
  });
});
