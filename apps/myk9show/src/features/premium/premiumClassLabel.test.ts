import { describe, expect, it } from 'vitest';
import {
  livePremiumClasses,
  livePremiumTrials,
} from '../../../../../supabase/functions/generate-premium/liveTrials';
import { formatPremiumClassLabel, isLivePremiumRow } from './premiumClassLabel';

describe('isLivePremiumRow (MYK9-2248)', () => {
  const rows = [
    { id: 'live', status: 'scheduled' },
    { id: 'no-status', status: null },
    { id: 'cancelled', status: 'cancelled' },
    { id: 'deleted', status: 'scheduled', deleted_at: '2026-01-01' },
    { id: 'both', status: 'cancelled', deleted_at: '2026-01-01' },
  ];

  it('keeps the same rows as the generator livePremiumClasses and livePremiumTrials', () => {
    const ids = (list: Array<{ id: string }>) => list.map(r => r.id);
    expect(ids(rows.filter(isLivePremiumRow))).toEqual(ids(livePremiumClasses(rows)));
    expect(ids(rows.filter(isLivePremiumRow))).toEqual(ids(livePremiumTrials(rows)));
  });

  it('labels a name-only class by its name', () => {
    expect(
      formatPremiumClassLabel({ element: '', level: '', section: 'A', name: 'Detective' })
    ).toBe('Detective A');
  });
});
