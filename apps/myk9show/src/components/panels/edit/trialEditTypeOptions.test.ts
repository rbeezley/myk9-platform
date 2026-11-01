import { describe, expect, it } from 'vitest';
import { trialEditTypeOptions } from './trialEditTypeOptions';

describe('trialEditTypeOptions (MYK9-1574)', () => {
  it('offers UKC Nosework and ASCA Scent Detection, not just the generic list', () => {
    expect(trialEditTypeOptions('UKC', undefined)).toContain('Nosework');
    expect(trialEditTypeOptions('ASCA', undefined)).toContain('Scent Detection');
  });

  it('keeps a legacy current value selectable', () => {
    expect(trialEditTypeOptions('UKC', 'scent_work')[0]).toBe('scent_work');
    expect(trialEditTypeOptions('UKC', 'Nosework').filter(t => t === 'Nosework')).toHaveLength(1);
  });

  it('falls back to the generic list without an organization', () => {
    expect(trialEditTypeOptions(undefined, undefined)).toContain('Agility');
  });
});
