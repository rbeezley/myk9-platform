import { describe, expect, it } from 'vitest';

import { buildClassFromTemplate } from '@/hooks/classStoreCompatHelpers';
import { isUnsetJudgeName } from '@/utils/classJudgeDisplay';
import { useClassStore } from '../classStore';

const generated = { className: 'Container Novice A', classNumber: '101' };

describe('template-generated classes carry no judge (MYK9-1853)', () => {
  it('buildClassFromTemplate writes an empty judge, never the literal TBD', () => {
    const cls = buildClassFromTemplate(generated, 'trial-1', 0, '2026-06-01', '1');
    expect(cls.judge).toBe('');
    expect(isUnsetJudgeName(cls.judge)).toBe(true);
  });

  it('addClassesFromTemplate writes an empty judge, never the literal TBD', () => {
    useClassStore.getState().addClassesFromTemplate('trial-1', [generated]);
    const added = useClassStore.getState().classes.filter(c => c.trialId === 'trial-1');
    expect(added.length).toBeGreaterThan(0);
    for (const cls of added) {
      expect(cls.judge).toBe('');
    }
  });
});
