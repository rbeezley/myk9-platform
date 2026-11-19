import { describe, expect, it } from 'vitest';
import { TrialType, formatTrialTypeLabel } from '@/types/template.types';
import { narrativeTrialType } from '../../../../../../supabase/functions/generate-premium/premiumNarratives.ts';

describe('edge narrative trial-type label mirrors formatTrialTypeLabel', () => {
  const stored = [
    ...Object.values(TrialType),
    ...Object.keys(TrialType),
    'scent_work',
    'Scent-Work',
    'akc_nosework',
    'ukc agility',
    'something custom',
  ];
  it.each(stored)('prints %s the way the app does', value => {
    expect(narrativeTrialType(value)).toBe(formatTrialTypeLabel(value));
  });
});
