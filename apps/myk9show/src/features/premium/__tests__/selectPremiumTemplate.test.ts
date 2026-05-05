import { describe, it, expect } from 'vitest';
import { selectPremiumTemplate } from '../selectPremiumTemplate';
import type { ClubPremiumTemplate } from '../../../types/premium-types';

const base: ClubPremiumTemplate = {
  id: 't1',
  clubId: 'c1',
  name: 'Test',
  trialType: null,
  isDefault: false,
  style: 'classic',
  vetClinicName: null,
  vetClinicAddress: null,
  vetClinicPhone: null,
  accommodations: [],
  hospitalityNotes: null,
  awardsDescription: null,
  additionalNotes: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('selectPremiumTemplate', () => {
  it('returns null when templates list is empty', () => {
    expect(selectPremiumTemplate([], 'Scent Work')).toBeNull();
  });

  it('matches by trial_type first', () => {
    const sw = { ...base, id: 'sw', trialType: 'Scent Work' };
    const def = { ...base, id: 'def', isDefault: true };
    expect(selectPremiumTemplate([def, sw], 'Scent Work')).toBe(sw);
  });

  it('falls back to default when no trial_type match', () => {
    const def = { ...base, id: 'def', isDefault: true };
    const ob = { ...base, id: 'ob', trialType: 'Obedience' };
    expect(selectPremiumTemplate([ob, def], 'Agility')).toBe(def);
  });

  it('returns null when no match and no default', () => {
    const ob = { ...base, id: 'ob', trialType: 'Obedience' };
    expect(selectPremiumTemplate([ob], 'Agility')).toBeNull();
  });

  it('returns null when trialType is null and no default exists', () => {
    const ob = { ...base, id: 'ob', trialType: 'Obedience' };
    expect(selectPremiumTemplate([ob], null)).toBeNull();
  });

  it('uses default when trialType is null', () => {
    const def = { ...base, id: 'def', isDefault: true };
    expect(selectPremiumTemplate([def], null)).toBe(def);
  });
});
