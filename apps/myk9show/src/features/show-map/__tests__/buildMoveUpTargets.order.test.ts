import { describe, expect, it } from 'vitest';

import { buildMoveUpTargets } from '../buildMoveUpTargets';
import type { BuildShowMapTreeInput } from '../showMapTypes';

type ClassInput = BuildShowMapTreeInput['classes'][number];

function cls(id: string, trialId: string, trialDate: string, level: string): ClassInput {
  return { id, trialId, name: `Buried ${level}`, element: 'Buried', level, trialDate };
}

describe('buildMoveUpTargets ordering (MYK9-1614)', () => {
  it('lists classes in the source class’s own trial first, even when another trial is earlier', () => {
    const classes = [
      cls('t1-novice', 'trial-1', '2026-10-24', 'Novice'),
      cls('t2-novice', 'trial-2', '2026-10-25', 'Novice'),
      cls('t2-advanced', 'trial-2', '2026-10-25', 'Advanced'),
      cls('t1-advanced', 'trial-1', '2026-10-24', 'Advanced'),
    ];
    expect(buildMoveUpTargets(classes, 't2-novice').map(target => target.id)).toEqual([
      't2-advanced',
      't1-advanced',
      't1-novice',
    ]);
  });
});
