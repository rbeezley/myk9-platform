import { describe, expect, it } from 'vitest';
import { TrialType } from '@/types/template.types';
import { resolveTrialTypeOptions } from './TrialConfigurationStep.helpers';

describe('resolveTrialTypeOptions', () => {
  it('keeps the full AKC discipline list even when templates only include Scent Work', () => {
    const options = resolveTrialTypeOptions('AKC', [
      { isActive: true, organization: 'AKC', trialType: 'Scent Work' },
    ]);

    expect(options).toContain(TrialType.SCENT_WORK);
    expect(options).toContain(TrialType.AGILITY);
    expect(options).toContain(TrialType.OBEDIENCE);
    expect(options).toContain(TrialType.RALLY);
    expect(options).toContain(TrialType.CONFORMATION);
    expect(options.at(-1)).toBe(TrialType.OTHER);
  });

  it('normalizes raw enum-style template values before deduping', () => {
    const options = resolveTrialTypeOptions('AKC', [
      { isActive: true, organization: 'AKC', trialType: 'scent_work' },
    ]);

    expect(options.filter(type => type === TrialType.SCENT_WORK)).toHaveLength(1);
    expect(options).not.toContain('scent_work' as TrialType);
  });
});
